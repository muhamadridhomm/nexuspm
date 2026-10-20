/**
 * A robust Markdown to HTML parser for NexusPM templates and specs.
 * Handles headings, covers, tables, lists, images, horizontal rules, and inline formatting.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split(/\r?\n/);
  const htmlOutput: string[] = [];
  
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let tableAlignments: ('left' | 'center' | 'right' | null)[] = [];

  const closeList = () => {
    if (inList && listType) {
      htmlOutput.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  };

  const closeTable = () => {
    if (inTable) {
      let tableHtml = '<div class="table-container my-4 overflow-x-auto"><table class="min-w-full border-collapse border border-slate-700 text-xs text-slate-200">';
      
      // Render Header
      if (tableHeaders.length > 0) {
        tableHtml += '<thead class="bg-slate-800 text-slate-100 font-bold border-b border-slate-750">';
        tableHtml += '<tr>';
        tableHeaders.forEach((h, idx) => {
          const align = tableAlignments[idx] || 'left';
          const inlineHtml = parseInline(h);
          tableHtml += `<th class="px-4 py-2 border border-slate-700 text-${align}">${inlineHtml}</th>`;
        });
        tableHtml += '</tr></thead>';
      }
      
      // Render Body
      if (tableRows.length > 0) {
        tableHtml += '<tbody class="divide-y divide-slate-800 bg-slate-900/40">';
        tableRows.forEach(row => {
          tableHtml += '<tr class="hover:bg-slate-800/30 transition-colors">';
          row.forEach((cell, idx) => {
            const align = tableAlignments[idx] || 'left';
            const inlineHtml = parseInline(cell);
            tableHtml += `<td class="px-4 py-2 border border-slate-700 text-${align}">${inlineHtml}</td>`;
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody>';
      }
      
      tableHtml += '</table></div>';
      htmlOutput.push(tableHtml);
      
      inTable = false;
      tableHeaders = [];
      tableRows = [];
      tableAlignments = [];
    }
  };

  const parseInline = (text: string): string => {
    let t = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Bold
    t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic
    t = t.replace(/\*(.*?)\*/g, '<em>$1</em>');
    t = t.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Image link inline
    t = t.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '<img src="$2" alt="$1" style="max-width:100%; border-radius:6px; margin:4px 0;" />');
    
    // Standard link
    t = t.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2" class="text-indigo-400 underline hover:text-indigo-300">$1</a>');
    
    // Inline code
    t = t.replace(/`(.*?)`/g, '<code class="bg-slate-950 px-1.5 py-0.5 rounded font-mono text-xs text-pink-400">$1</code>');
    
    // Line breaks
    t = t.replace(/<br\s*\/?>/gi, '<br/>');
    
    return t;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Handle Images alone on a line
    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
    if (imageMatch) {
      closeList();
      closeTable();
      htmlOutput.push(`<p class="my-3 text-center"><img src="${imageMatch[2]}" alt="${imageMatch[1]}" style="max-width: 100%; max-height: 250px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" /></p>`);
      continue;
    }

    // 2. Handle Horizontal Rules
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      closeList();
      closeTable();
      htmlOutput.push('<hr class="border-slate-800 my-6" />');
      continue;
    }

    // 3. Handle Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      closeTable();
      const level = headingMatch[1].length;
      const title = parseInline(headingMatch[2]);
      
      let cssClass = 'font-bold text-slate-100 tracking-tight my-4';
      if (level === 1) cssClass += ' text-2xl border-b border-slate-800 pb-2 mt-6';
      else if (level === 2) cssClass += ' text-xl mt-5';
      else if (level === 3) cssClass += ' text-lg mt-4';
      else cssClass += ' text-sm mt-3';

      htmlOutput.push(`<h${level} class="${cssClass}">${title}</h${level}>`);
      continue;
    }

    // 4. Handle Tables
    if (trimmed.startsWith('|')) {
      closeList();
      
      // Parse columns
      // e.g. | col 1 | col 2 |
      const cols = line.split('|')
        .map(c => c.trim())
        .slice(1, -1); // remove first and last elements since split creates empty strings for leading/trailing |
        
      if (!inTable) {
        inTable = true;
        tableHeaders = cols;
        
        // Peek at next line to see if it is a separator line (e.g. |:---|:---:|)
        let nextLine = '';
        if (i + 1 < lines.length) {
          nextLine = lines[i + 1].trim();
        }
        if (nextLine.startsWith('|') && nextLine.includes('-')) {
          // Parse alignments
          const sepCols = nextLine.split('|').map(c => c.trim()).slice(1, -1);
          tableAlignments = sepCols.map(col => {
            const left = col.startsWith(':');
            const right = col.endsWith(':');
            if (left && right) return 'center';
            if (right) return 'right';
            return 'left';
          });
          i++; // skip separator line
        } else {
          // default alignments
          tableAlignments = tableHeaders.map(() => 'left');
        }
      } else {
        tableRows.push(cols);
      }
      continue;
    } else if (inTable) {
      closeTable();
    }

    // 5. Handle Lists
    const unorderedMatch = trimmed.match(/^([\*\-\+])\s+(.*)$/);
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    
    if (unorderedMatch) {
      closeTable();
      if (!inList || listType !== 'ul') {
        closeList();
        inList = true;
        listType = 'ul';
        htmlOutput.push('<ul class="list-disc pl-6 my-2 text-slate-350 space-y-1">');
      }
      htmlOutput.push(`<li>${parseInline(unorderedMatch[2])}</li>`);
      continue;
    } else if (orderedMatch) {
      closeTable();
      if (!inList || listType !== 'ol') {
        closeList();
        inList = true;
        listType = 'ol';
        htmlOutput.push('<ol class="list-decimal pl-6 my-2 text-slate-350 space-y-1">');
      }
      htmlOutput.push(`<li>${parseInline(orderedMatch[2])}</li>`);
      continue;
    }

    // 6. Empty Line (close lists/tables, reset tags)
    if (trimmed === '') {
      closeList();
      closeTable();
      continue;
    }

    // 7. Regular paragraph
    closeList();
    closeTable();
    htmlOutput.push(`<p class="my-2 leading-relaxed text-slate-300 text-xs">${parseInline(trimmed)}</p>`);
  }

  // Final cleanup closures
  closeList();
  closeTable();

  return htmlOutput.join('\n');
}
