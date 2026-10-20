import os
import json
import httpx
from fastapi import FastAPI, HTTPException, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import docx
import io
import re

from scheduler import solve_rcmpsp_drawers

app = FastAPI(title="NexusPM Backend Engine")

# Configure CORS for Next.js communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class ScheduleRequest(BaseModel):
    issues: List[Dict[str, Any]]
    resources: List[Dict[str, Any]]
    requirements: List[Dict[str, Any]]
    simulations: Optional[int] = 100

class TriageRequest(BaseModel):
    title: str
    description: Optional[str] = ""

class PDFExportRequest(BaseModel):
    title: str
    html_content: str

class DOCXExportRequest(BaseModel):
    title: str
    html_content: str

class GenerateDocumentRequest(BaseModel):
    prompt: str
    document_type: str
    context: Optional[str] = ""
    template_content: Optional[str] = ""
    title: Optional[str] = ""
    prepared_by: Optional[str] = ""
    created_date: Optional[str] = ""
    use_toc: Optional[bool] = True

# Helper local mockup triage rules
def local_triage_rules(title: str, description: str) -> Dict[str, Any]:
    text = (title + " " + (description or "")).lower()
    priority = "NORMAL"
    if any(k in text for k in ["critical", "broken", "urgent", "blocker", "gagal", "error"]):
        priority = "HIGH"
    if any(k in text for k in ["crash", "security", "bocor", "down"]):
        priority = "URGENT"
    if any(k in text for k in ["cosmetic", "typo", "wording"]):
        priority = "LOW"
        
    suggested_tags = []
    if any(k in text for k in ["db", "query", "database", "tabel"]):
        suggested_tags.append("Database")
    if any(k in text for k in ["ui", "css", "tampilan", "layout", "halaman", "tombol"]):
        suggested_tags.append("Frontend")
    if any(k in text for k in ["api", "endpoint", "backend", "service"]):
        suggested_tags.append("Backend")
    if any(k in text for k in ["bug", "error", "salah", "tidak sesuai"]):
        suggested_tags.append("Bug")
        
    return {
        "priority": priority,
        "tags": suggested_tags if suggested_tags else ["General"],
        "assignee_role": "Backend" if "Backend" in suggested_tags else "Frontend" if "Frontend" in suggested_tags else "QA",
        "confidence": 0.6
    }

# Gemini API Connector for Triage
async def query_gemini_triage(title: str, description: str, api_key: str, model: str = "gemini-1.5-flash") -> Dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    prompt = f"""
    You are an automated project triage assistant. Analyze this issue title and description:
    Title: {title}
    Description: {description}
    
    Categorize the issue and return a JSON object with:
    - "priority": must be one of "URGENT", "HIGH", "NORMAL", "LOW"
    - "tags": a list of tags (e.g. "Backend", "Frontend", "Database", "Bug", "Enhancement", etc.)
    - "assignee_role": most likely assignee role ("BA", "Backend", "Frontend", "QA", "PM")
    - "confidence": value between 0.0 and 1.0 based on description clarity
    
    Return ONLY the valid JSON object. No markdown, no explanations.
    """
    
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                text_response = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text_response.startswith("```json"):
                    text_response = text_response.split("```json")[1].split("```")[0].strip()
                elif text_response.startswith("```"):
                    text_response = text_response.split("```")[1].split("```")[0].strip()
                return json.loads(text_response)
            else:
                return local_triage_rules(title, description)
        except Exception:
            return local_triage_rules(title, description)

# Gemini API Connector for Document generation
async def query_gemini_generate_doc(req: GenerateDocumentRequest, api_key: str, model: str = "gemini-1.5-flash") -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    template_instruction = ""
    if req.template_content:
        template_instruction = f"""
        You are supplied with a template layout structure:
        ---
        {req.template_content}
        ---
        
        Fill in this template structure using the user prompt details.
        
        CRITICAL RULES:
        1. If the provided prompt or context lacks information to complete a specific placeholder in the template (e.g. [Insert Name], [Feature 2 description], [Step 3], etc.), do NOT hallucinate or make up fake information. Instead, leave the placeholder exactly as is (e.g., '[Insert Project / Application Name]') or insert '[MISSING: describe what is missing]'.
        2. Keep the document structure intact, including all sections from the template.
        """
    else:
        template_instruction = f"""
        Structure the document clearly with standard sections based on the prompt (e.g. Background, Objectives, Requirements, Tech Spec details, and Checklists where relevant).
        """

    toc_instruction = ""
    if req.use_toc:
        toc_instruction = "Ensure that a clear '## DAFTAR ISI' or Table of Contents section is rendered with navigation anchor links targeting respective headings."
    else:
        toc_instruction = "Do not generate a 'DAFTAR ISI' or Table of Contents section."

    prompt = f"""
    You are a professional technical writer and product manager.
    Generate a comprehensive technical document of type '{req.document_type}'.
    
    Document Metadata to embed in the cover page section:
    - Title: {req.title}
    - Prepared by: {req.prepared_by}
    - Created on: {req.created_date}
    
    User prompt detail:
    "{req.prompt}"
    
    Additional Project Context:
    "{req.context}"
    
    {template_instruction}
    
    {toc_instruction}
    
    Output requirements:
    - Format output in clean, semantic HTML format (use standard tags: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <br/>, <hr/>, and fully structured <table> rows).
    - Do NOT output markdown formatting (like ** or # or |). Only semantic HTML code.
    - If there are missing fields or placeholders that cannot be resolved from the prompt, preserve them as bracket placeholders (e.g., `[Insert ...]`, `[MISSING: detail]`) or `[?]` so they can be filled in later. Do NOT invent/hallucinate values for them.
    """
    
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=90.0)
            if response.status_code == 200:
                data = response.json()
                content_html = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                # Clean code blocks if generated
                if content_html.startswith("```html"):
                    content_html = content_html.split("```html")[1].split("```")[0].strip()
                elif content_html.startswith("```"):
                    content_html = content_html.split("```")[1].split("```")[0].strip()
                return content_html
            else:
                try:
                    err_json = response.json()
                    err_msg = err_json.get("error", {}).get("message", response.text)
                except Exception:
                    err_msg = response.text
                print(f"Gemini API Error: {response.status_code} - {err_msg}")
                return f"<h1>Error from Gemini API</h1><p>Status code: {response.status_code}</p><p>{err_msg}</p>"
        except Exception as e:
            import traceback
            traceback.print_exc()
            return f"<h1>Error generating document</h1><p>{str(e)}</p>"

# Local LLM Connector (OpenAI API / Ollama compatible)
async def query_local_llm(prompt: str, url: str, model: str) -> str:
    if not url:
        raise ValueError("Local AI URL is not configured")
    
    target_url = url
    # Ensure URL ends with completions or generate correctly
    if not target_url.endswith("/chat/completions") and not target_url.endswith("/completions") and not target_url.endswith("/generate"):
        if target_url.endswith("/"):
            target_url += "chat/completions"
        else:
            target_url += "/chat/completions"
            
    payload = {
        "model": model or "llama3",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    
    headers = {"Content-Type": "application/json"}
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(target_url, headers=headers, json=payload, timeout=90.0)
            if response.status_code == 200:
                data = response.json()
                if "choices" in data:
                    return data["choices"][0]["message"]["content"].strip()
                elif "response" in data:
                    return data["response"].strip()
            
            # Direct Ollama API /api/generate fallback if standard chat/completions fails
            if "11434" in target_url or "localhost" in target_url:
                fallback_url = url.split("/v1")[0] if "/v1" in url else url
                if not fallback_url.endswith("/api/generate"):
                    fallback_url = fallback_url.rstrip("/") + "/api/generate"
                fallback_payload = {
                    "model": model or "llama3",
                    "prompt": prompt,
                    "stream": False
                }
                res = await client.post(fallback_url, headers=headers, json=fallback_payload, timeout=90.0)
                if res.status_code == 200:
                    return res.json().get("response", "").strip()
            
            raise HTTPException(status_code=500, detail=f"Local AI failed with status {response.status_code}: {response.text}")
        except Exception as e:
            # Direct fallback check for native Ollama API if we haven't hit it yet
            if "11434" in url or "localhost" in url:
                try:
                    fallback_url = url.split("/v1")[0] if "/v1" in url else url
                    if not fallback_url.endswith("/api/generate"):
                        fallback_url = fallback_url.rstrip("/") + "/api/generate"
                    fallback_payload = {
                        "model": model or "llama3",
                        "prompt": prompt,
                        "stream": False
                    }
                    res = await client.post(fallback_url, headers=headers, json=fallback_payload, timeout=90.0)
                    if res.status_code == 200:
                        return res.json().get("response", "").strip()
                except Exception:
                    pass
            raise HTTPException(status_code=500, detail=f"Failed to query local AI: {str(e)}")

@app.post("/api/schedule")
def schedule_portfolio(req: ScheduleRequest):
    try:
        result = solve_rcmpsp_drawers(
            issues=req.issues,
            resources=req.resources,
            requirements=req.requirements,
            simulations=req.simulations
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/triage")
async def triage_issue(
    req: TriageRequest,
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_ai_mode: Optional[str] = Header(None, alias="X-AI-Mode"),
    x_local_ai_url: Optional[str] = Header(None, alias="X-Local-AI-Url"),
    x_local_ai_model: Optional[str] = Header(None, alias="X-Local-AI-Model"),
):
    mode = x_ai_mode or "local_rules"
    api_key = x_gemini_key or os.environ.get("GEMINI_API_KEY")
    
    if mode == "external_api" and api_key:
        gemini_model = x_local_ai_model or "gemini-1.5-flash"
        result = await query_gemini_triage(req.title, req.description, api_key, model=gemini_model)
        result["mode"] = "gemini"
        return result
    elif mode == "local_ai" and x_local_ai_url:
        prompt = f"""
        You are an automated project triage assistant. Analyze this issue title and description:
        Title: {req.title}
        Description: {req.description or ''}
        
        Categorize the issue and return a JSON object with:
        - "priority": must be one of "URGENT", "HIGH", "NORMAL", "LOW"
        - "tags": a list of tags (e.g. "Backend", "Frontend", "Database", "Bug", "Enhancement", etc.)
        - "assignee_role": most likely assignee role ("BA", "Backend", "Frontend", "QA", "PM")
        - "confidence": value between 0.0 and 1.0 based on description clarity
        
        Return ONLY the valid JSON object. No markdown, no explanations.
        """
        try:
            raw_response = await query_local_llm(prompt, x_local_ai_url, x_local_ai_model)
            text_response = raw_response.strip()
            if text_response.startswith("```json"):
                text_response = text_response.split("```json")[1].split("```")[0].strip()
            elif text_response.startswith("```"):
                text_response = text_response.split("```")[1].split("```")[0].strip()
            result = json.loads(text_response)
            result["mode"] = "local_ai"
            return result
        except Exception as e:
            result = local_triage_rules(req.title, req.description)
            result["mode"] = "local_rules_fallback"
            result["fallback_reason"] = str(e)
            return result
    else:
        result = local_triage_rules(req.title, req.description)
        result["mode"] = "local_rules"
        return result

@app.post("/api/generate-document")
async def generate_document(
    req: GenerateDocumentRequest,
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-Key"),
    x_ai_mode: Optional[str] = Header(None, alias="X-AI-Mode"),
    x_local_ai_url: Optional[str] = Header(None, alias="X-Local-AI-Url"),
    x_local_ai_model: Optional[str] = Header(None, alias="X-Local-AI-Model"),
):
    mode = x_ai_mode or "local_rules"
    api_key = x_gemini_key or os.environ.get("GEMINI_API_KEY")
    
    if mode == "external_api" and api_key:
        gemini_model = x_local_ai_model or "gemini-1.5-flash"
        content_html = await query_gemini_generate_doc(req, api_key, model=gemini_model)
        return {"content": content_html, "mode": "gemini"}
    elif mode == "local_ai" and x_local_ai_url:
        template_instruction = ""
        if req.template_content:
            template_instruction = f"""
            You are supplied with a template layout structure:
            ---
            {req.template_content}
            ---
            
            Fill in this template structure using the user prompt details.
            
            CRITICAL RULES:
            1. If the provided prompt or context lacks information to complete a specific placeholder in the template (e.g. [Insert Name], [Feature 2 description], [Step 3], etc.), do NOT hallucinate or make up fake information. Instead, leave the placeholder exactly as is (e.g., '[Insert Project / Application Name]') or insert '[MISSING: describe what is missing]'.
            2. Keep the document structure intact, including all sections from the template.
            """
        else:
            template_instruction = f"""
            Structure the document clearly with standard sections based on the prompt (e.g. Background, Objectives, Requirements, Tech Spec details, and Checklists where relevant).
            """

        toc_instruction = ""
        if req.use_toc:
            toc_instruction = "Ensure that a clear '## DAFTAR ISI' or Table of Contents section is rendered with navigation anchor links targeting respective headings."
        else:
            toc_instruction = "Do not generate a 'DAFTAR ISI' or Table of Contents section."

        prompt = f"""
        You are a professional technical writer and product manager.
        Generate a comprehensive technical document of type '{req.document_type}'.
        
        Document Metadata to embed in the cover page section:
        - Title: {req.title}
        - Prepared by: {req.prepared_by}
        - Created on: {req.created_date}
        
        User prompt detail:
        "{req.prompt}"
        
        Additional Project Context:
        "{req.context}"
        
        {template_instruction}
        
        {toc_instruction}
        
        Output requirements:
        - Format output in clean, semantic HTML format (use standard tags: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <br/>, <hr/>, and fully structured <table> rows).
        - Do NOT output markdown formatting (like ** or # or |). Only semantic HTML code.
        - If there are missing fields or placeholders that cannot be resolved from the prompt, preserve them as bracket placeholders (e.g., `[Insert ...]`, `[MISSING: detail]`) or `[?]` so they can be filled in later. Do NOT invent/hallucinate values for them.
        """
        try:
            content_html = await query_local_llm(prompt, x_local_ai_url, x_local_ai_model)
            if content_html.startswith("```html"):
                content_html = content_html.split("```html")[1].split("```")[0].strip()
            elif content_html.startswith("```"):
                content_html = content_html.split("```")[1].split("```")[0].strip()
            return {"content": content_html, "mode": "local_ai"}
        except Exception as e:
            mock_content = f"<h1>{req.document_type} Document (Local AI Fallback)</h1><h2>1. Objective</h2><p>Mockup document generated from prompt: {req.prompt}</p><p>Note: Local AI request failed ({str(e)}) so we fell back to mock generation.</p>"
            return {"content": mock_content, "mode": "local_mock_fallback"}
    else:
        # Local mock fallback
        mock_content = f"<h1>{req.document_type} Document</h1><h2>1. Objective</h2><p>Mockup document generated from prompt: {req.prompt}</p><h2>2. Scope details</h2><p>All items in this spec are bound to the project context: {req.context or 'General Project'}</p>"
        return {"content": mock_content, "mode": "local_mock"}

@app.post("/api/export-pdf")
def export_pdf(req: PDFExportRequest):
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from lxml import html
        import copy
        
        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
        
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'DocTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=24,
            leading=28, textColor=colors.HexColor('#1E1B4B'), alignment=1, spaceAfter=20, spaceBefore=40
        )
        body_style = ParagraphStyle(
            'DocBody', parent=styles['BodyText'], fontName='Helvetica', fontSize=10,
            leading=14, textColor=colors.HexColor('#334155'), spaceAfter=8
        )
        heading_style = ParagraphStyle(
            'DocHeading', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=13,
            leading=17, textColor=colors.HexColor('#1E1B4B'), spaceBefore=14, spaceAfter=8
        )
        meta_style = ParagraphStyle(
            'DocMeta', parent=styles['Normal'], fontName='Helvetica', fontSize=10,
            leading=14, textColor=colors.HexColor('#475569'), alignment=1, spaceAfter=6
        )
        
        story = []
        
        # Parse HTML safely
        content = req.html_content.strip()
        if not content.startswith("<html") and not content.startswith("<body"):
            content = f"<body>{content}</body>"
            
        tree = html.fromstring(content)
        
        def clean_inner_html(html_str: str) -> str:
            # Convert tags unsupported by ReportLab Paragraph to supported ones
            s = html_str
            s = re.sub(r'</?strong[^>]*>', lambda m: '<b>' if '/' not in m.group(0) else '</b>', s)
            s = re.sub(r'</?em[^>]*>', lambda m: '<i>' if '/' not in m.group(0) else '</i>', s)
            s = re.sub(r'</?span[^>]*>', '', s)
            s = re.sub(r'</?div[^>]*>', '', s)
            s = s.replace('&nbsp;', ' ')
            return s

        def format_cell_html(col_el) -> str:
            # Check for lists inside cell
            list_els = col_el.xpath('.//ul | .//ol')
            if list_els:
                copied = copy.deepcopy(col_el)
                for lst in copied.xpath('.//ul | .//ol'):
                    is_ordered = lst.tag == 'ol'
                    replacement_texts = []
                    for idx, li in enumerate(lst.findall('.//li')):
                        prefix = f"{idx+1}. " if is_ordered else "&bull; "
                        li_html = html.tostring(li, encoding='unicode').strip()
                        li_inner = re.sub(r'^<li[^>]*>(.*)</li>$', r'\1', li_html, flags=re.DOTALL).strip()
                        replacement_texts.append(f"{prefix}{li_inner}")
                    
                    br_string = "<br/>".join(replacement_texts)
                    span_el = html.fragment_fromstring(f"<span>{br_string}</span>")
                    lst.addprevious(span_el)
                    lst.getparent().remove(lst)
                    
                inner_html = html.tostring(copied, encoding='unicode').strip()
                tag = copied.tag
                return re.sub(r'^<' + tag + r'[^>]*>(.*)</' + tag + r'>$', r'\1', inner_html, flags=re.DOTALL).strip()
            
            cell_html = html.tostring(col_el, encoding='unicode').strip()
            tag = col_el.tag
            return re.sub(r'^<' + tag + r'[^>]*>(.*)</' + tag + r'>$', r'\1', cell_html, flags=re.DOTALL).strip()

        # Walk children recursively to extract block-level elements
        def get_block_elements(parent_el):
            blocks = []
            for child in parent_el.iterchildren():
                tag = child.tag
                if tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'table', 'hr']:
                    blocks.append(child)
                elif tag in ['div', 'section', 'article', 'body']:
                    blocks.extend(get_block_elements(child))
            return blocks

        elements_to_parse = tree.body if tree.body is not None else tree
        blocks = get_block_elements(elements_to_parse)
        
        is_first_hr = True
        has_cover = False
        
        # Check if first hr exists to detect cover page
        for b in blocks:
            if b.tag == 'hr':
                has_cover = True
                break
            
        for child in blocks:
            tag = child.tag
            child_html = html.tostring(child, encoding='unicode').strip()
            
            if tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                level = int(tag[1])
                size = 18 - (level * 1.5)
                # If on cover page, center and make H1 larger
                align = 1 if (has_cover and is_first_hr and level == 1) else 0
                child_inner = re.sub(r'^<' + tag + r'[^>]*>(.*)</' + tag + r'>$', r'\1', child_html, flags=re.DOTALL).strip()
                child_inner = clean_inner_html(child_inner)
                
                h_style = ParagraphStyle(
                    f'H_{level}', parent=heading_style, fontSize=size, leading=size+4, 
                    spaceBefore=14, spaceAfter=8, alignment=align,
                    textColor=colors.HexColor('#1E1B4B') if level <= 2 else colors.HexColor('#4338CA')
                )
                story.append(Paragraph(child_inner, h_style))
            elif tag == 'p':
                # Center cover paragraphs
                p_style = meta_style if (has_cover and is_first_hr) else body_style
                # Handle images inside paragraph
                if '<img' in child_html:
                    story.append(Spacer(1, 10))
                    story.append(Paragraph("<font color='#6366F1'><b>[ Image Placeholder ]</b></font>", meta_style))
                    story.append(Spacer(1, 10))
                else:
                    child_inner = re.sub(r'^<p[^>]*>(.*)</p>$', r'\1', child_html, flags=re.DOTALL).strip()
                    child_inner = clean_inner_html(child_inner)
                    story.append(Paragraph(child_inner, p_style))
            elif tag in ['ul', 'ol']:
                for li in child.findall('.//li'):
                    li_html = html.tostring(li, encoding='unicode').strip()
                    li_inner = re.sub(r'^<li[^>]*>(.*)</li>$', r'\1', li_html, flags=re.DOTALL).strip()
                    li_inner = clean_inner_html(li_inner)
                    story.append(Paragraph(f"&bull; {li_inner}", ParagraphStyle('LI', parent=body_style, leftIndent=15, spaceAfter=4)))
            elif tag == 'table':
                rows_el = child.findall('.//tr')
                if not rows_el:
                    continue
                
                table_data = []
                for r_idx, row_el in enumerate(rows_el):
                    row_data = []
                    cols_el = row_el.findall('./td') + row_el.findall('./th')
                    for col_el in cols_el:
                        col_inner = format_cell_html(col_el)
                        col_inner = clean_inner_html(col_inner)
                        col_tag = col_el.tag
                        
                        cell_style = ParagraphStyle('TableCell', parent=body_style, fontSize=9, leading=11, spaceAfter=0)
                        if col_tag == 'th' or r_idx == 0:
                            cell_style = ParagraphStyle('TableHeaderCell', parent=body_style, fontName='Helvetica-Bold', fontSize=9, leading=11, textColor=colors.HexColor('#FFFFFF'), spaceAfter=0)
                            
                        cell_para = Paragraph(col_inner, cell_style)
                        row_data.append(cell_para)
                    if row_data:
                        table_data.append(row_data)
                
                if table_data:
                    t = Table(table_data, colWidths=None)
                    t.setStyle(TableStyle([
                        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4F46E5')), # Slate Indigo header
                        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                        ('VALIGN', (0,0), (-1,-1), 'TOP'),
                        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                        ('TOPPADDING', (0,0), (-1,-1), 6),
                        ('LEFTPADDING', (0,0), (-1,-1), 6),
                        ('RIGHTPADDING', (0,0), (-1,-1), 6),
                        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
                        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#FFFFFF'), colors.HexColor('#F8FAFC')]), # Zebra striping
                    ]))
                    story.append(t)
                    story.append(Spacer(1, 12))
            elif tag == 'hr':
                if has_cover and is_first_hr:
                    is_first_hr = False
                story.append(PageBreak())
                
        doc.build(story)
        pdf_buffer.seek(0)
        
        return Response(
            content=pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=document.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/export-docx")
def export_docx(req: DOCXExportRequest):
    try:
        from lxml import html
        doc = docx.Document()
        
        # Parse HTML safely
        content = req.html_content.strip()
        if not content.startswith("<html") and not content.startswith("<body"):
            content = f"<body>{content}</body>"
            
        tree = html.fromstring(content)
        
        def add_runs_to_paragraph(node, paragraph):
            if node.text:
                paragraph.add_run(node.text)
            for child in node.getchildren():
                child_tag = child.tag
                child_text = child.text_content() if len(child) > 0 else (child.text or "")
                    
                if child_tag in ['strong', 'b']:
                    run = paragraph.add_run(child_text)
                    run.bold = True
                elif child_tag in ['em', 'i']:
                    run = paragraph.add_run(child_text)
                    run.italic = True
                elif child_tag == 'a':
                    run = paragraph.add_run(child_text)
                    run.font.color.rgb = docx.shared.RGBColor(0x4F, 0x46, 0xE5)
                    run.underline = True
                elif child_tag == 'br':
                    paragraph.add_run().add_break()
                else:
                    run = paragraph.add_run(child_text)
                    
                if child.tail:
                    paragraph.add_run(child.tail)

        def populate_docx_cell(cell, col_el, r_idx):
            p = cell.paragraphs[0]
            # Set default spacing
            p.paragraph_format.space_after = docx.shared.Pt(3)
            p.paragraph_format.space_before = docx.shared.Pt(3)
            
            # Check if cell has list elements
            list_items = col_el.findall('.//li')
            if list_items:
                # If there's text before the lists
                prefix_text = (col_el.text or "").strip()
                if prefix_text:
                    run = p.add_run(prefix_text)
                    if col_el.tag == 'th' or r_idx == 0:
                        run.bold = True
                    p = cell.add_paragraph()
                    p.paragraph_format.space_after = docx.shared.Pt(3)
                    p.paragraph_format.space_before = docx.shared.Pt(3)
                
                for idx, li in enumerate(list_items):
                    is_ordered = False
                    parent = li.getparent()
                    if parent is not None and parent.tag == 'ol':
                        is_ordered = True
                        
                    bullet_prefix = f"{idx + 1}. " if is_ordered else "• "
                    li_p = p if idx == 0 and not p.text else cell.add_paragraph()
                    li_p.paragraph_format.space_after = docx.shared.Pt(2)
                    li_p.paragraph_format.space_before = docx.shared.Pt(2)
                    
                    run_prefix = li_p.add_run(bullet_prefix)
                    run_prefix.bold = True
                    
                    add_runs_to_paragraph(li, li_p)
                    # Style headers inside cell if any
                    if col_el.tag == 'th' or r_idx == 0:
                        for r in li_p.runs:
                            r.bold = True
            else:
                add_runs_to_paragraph(col_el, p)
                if col_el.tag == 'th' or r_idx == 0:
                    for run in p.runs:
                        run.bold = True

        # Walk children recursively to extract block-level elements
        def get_block_elements(parent_el):
            blocks = []
            for child in parent_el.iterchildren():
                tag = child.tag
                if tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'table', 'hr']:
                    blocks.append(child)
                elif tag in ['div', 'section', 'article', 'body']:
                    blocks.extend(get_block_elements(child))
            return blocks

        elements_to_parse = tree.body if tree.body is not None else tree
        blocks = get_block_elements(elements_to_parse)
        
        is_first_hr = True
        has_cover = False
        for b in blocks:
            if b.tag == 'hr':
                has_cover = True
                break
        
        # If there is a cover page, we don't add the root heading at the very top immediately
        for child in blocks:
            tag = child.tag
            
            if tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                level = int(tag[1])
                heading_text = child.text_content().strip()
                p = doc.add_heading(heading_text, level=level)
                if has_cover and is_first_hr and level == 1:
                    p.alignment = 1 # Center align cover titles
            elif tag == 'p':
                if '<img' in html.tostring(child, encoding='unicode'):
                    # Image placeholder
                    p = doc.add_paragraph()
                    p.alignment = 1
                    run = p.add_run("[ Image Placeholder ]")
                    run.bold = True
                    run.font.color.rgb = docx.shared.RGBColor(0x63, 0x66, 0xF1)
                else:
                    p = doc.add_paragraph()
                    if has_cover and is_first_hr:
                        p.alignment = 1 # Center cover meta info
                    add_runs_to_paragraph(child, p)
            elif tag in ['ul', 'ol']:
                for li in child.findall('.//li'):
                    p = doc.add_paragraph(style='List Bullet')
                    add_runs_to_paragraph(li, p)
            elif tag == 'table':
                rows_el = child.findall('.//tr')
                if not rows_el:
                    continue
                
                max_cols = 0
                for row_el in rows_el:
                    cols = row_el.findall('./td') + row_el.findall('./th')
                    max_cols = max(max_cols, len(cols))
                
                table = doc.add_table(rows=0, cols=max_cols)
                table.style = 'Table Grid'
                
                for r_idx, row_el in enumerate(rows_el):
                    row_cells = table.add_row().cells
                    cols_el = row_el.findall('./td') + row_el.findall('./th')
                    for i, col_el in enumerate(cols_el):
                        if i < len(row_cells):
                            cell = row_cells[i]
                            populate_docx_cell(cell, col_el, r_idx)
            elif tag == 'hr':
                if has_cover and is_first_hr:
                    is_first_hr = False
                doc.add_page_break()
                
        docx_buffer = io.BytesIO()
        doc.save(docx_buffer)
        docx_buffer.seek(0)
        
        return Response(
            content=docx_buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename=document.docx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
