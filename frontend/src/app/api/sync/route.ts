import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Seed database if empty
    let workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          id: "default-workspace",
          name: "Nexus Master Workspace"
        }
      });
      await prisma.project.create({
        data: {
          id: "default-project",
          name: "Nexus App Project",
          workspaceId: workspace.id
        }
      });
      await prisma.resource.createMany({
        data: [
          { id: "res-1", name: "Backend Developer", capacity: 1, workspaceId: workspace.id },
          { id: "res-2", name: "Frontend Developer", capacity: 1, workspaceId: workspace.id },
          { id: "res-3", name: "QA Engineer", capacity: 1, workspaceId: workspace.id }
        ]
      });
    }

    // Seed Document Types if empty
    const docTypesCount = await prisma.documentType.count();
    if (docTypesCount === 0) {
      await prisma.documentType.createMany({
        data: [
          { id: "type-brd", name: "Business Requirements Document (BRD)" },
          { id: "type-srs", name: "Software Requirements Specification (SRS)" },
          { id: "type-tdd", name: "Technical Design Document (TDD)" },
          { id: "type-uat", name: "User Acceptance Testing (UAT) Plan" }
        ]
      });

      // Seed Templates
      await prisma.documentTemplate.createMany({
        data: [
          {
            id: "temp-brd",
            name: "Standard BRD Template",
            documentTypeId: "type-brd",
            content: `# Business Requirements Document
# [Insert Project / Application Name]

**Prepared by:** [Insert Prepared By / Team Name]  
**Created on:** [Insert Date]  

---

## 1. Objective
Provide high-level strategic alignment details.`
          },
          {
            id: "temp-srs",
            name: "Standard SRS Template (EARS syntax)",
            documentTypeId: "type-srs",
            content: `# Software Requirements Specification
# [Insert Project / Application Name]

**Prepared by:** [Insert Prepared By / Team Name]  
**Created on:** [Insert Date]  

---

## 1. Functional Requirements
* While the system is in [State], the [System] shall [Behavior].`
          },
          {
            id: "temp-tdd",
            name: "Standard TDD Template",
            documentTypeId: "type-tdd",
            content: `# Technical Design Document
# [Insert Project / Application Name]

**Prepared by:** [Insert Prepared By / Team Name]  
**Created on:** [Insert Date]  

---

## 1. Data Mutations & Schemas
Detail the database relational mapping specifications here.`
          },
          {
            id: "temp-uat",
            name: "Standard UAT Plan Checklist",
            documentTypeId: "type-uat",
            content: `![Header/Banner Image Placeholder](insert_header_image_url_here)

# User Acceptance Test
# [Insert Project / Application Name]

![Company Logo Placeholder](insert_logo_image_url_here)

**Prepared by:** [Insert Prepared By / Team Name]  
**Created on:** [Insert Date]  

---

## DAFTAR ISI

1. [PENDAHULUAN](#1-pendahuluan)
2. [DESKRIPSI TESTING](#2-deskripsi-testing)
   * 2.1. [Jadwal Dan Lokasi Pengujian](#21-jadwal-dan-lokasi-pengujian)
3. [DETAIL TESTING](#3-detail-testing)
   * 3.1. [Test Case 1 Title Placeholder](#31-test-case-1-title-placeholder)
   * 3.2. [Test Case 2 Title Placeholder](#32-test-case-2-title-placeholder)
   * 3.3. [Test Case 3 Title Placeholder](#33-test-case-3-title-placeholder)
4. [SUMMARY HASIL PENGUJIAN](#4-summary-hasil-pengujian)
5. [PENUTUP & PENANDA TANGAN](#5-penutup--penanda-tangan)

---

## 1. PENDAHULUAN
Dokumen ini menjelaskan rencana pengujian dan hasil User Acceptance Test untuk memastikan sistem berjalan sesuai kebutuhan.

---

## 2. DESKRIPSI TESTING
Pengujian dilakukan untuk memverifikasi fungsionalitas utama aplikasi.

### 2.1. Jadwal Dan Lokasi Pengujian
| Aktivitas | Tanggal | Lokasi |
| :--- | :--- | :--- |
| Uji Coba Awal | 2026-06-05 | Staging Lab |
| Uji Coba Akhir | 2026-06-10 | Production Lab |

---

## 3. DETAIL TESTING

### 3.1. Test Case 1 Title Placeholder
| Langkah | Deskripsi | Hasil Yang Diharapkan | Status |
| :--- | :--- | :--- | :--- |
| 1 | Buka Halaman Login | Form Login ditampilkan | Pass |
| 2 | Input kredensial salah | Pesan error muncul | Pass |

### 3.2. Test Case 2 Title Placeholder
* Uji coba input form
* Uji coba response API

### 3.3. Test Case 3 Title Placeholder
* Verifikasi database record

---

## 4. SUMMARY HASIL PENGUJIAN
Semua test case utama dinyatakan lulus.

---

## 5. PENUTUP & PENANDA TANGAN
Demikian dokumen UAT ini dibuat untuk dipergunakan sebagaimana mestinya.

**Tanda Tangan:**
* QA Lead: [ ]
* Product Owner: [ ]`
          }
        ]
      });
    }

    const workspaces = await prisma.workspace.findMany();
    const projects = await prisma.project.findMany();
    const cycles = await prisma.cycle.findMany();
    const issues = await prisma.issue.findMany({
      include: { resourceRequirements: true }
    });
    const pages = await prisma.page.findMany();
    const resources = await prisma.resource.findMany();
    const resourceRequirements = await prisma.resourceRequirement.findMany();
    
    // Fetch document tables
    const folders = await prisma.folder.findMany();
    const documentTypes = await prisma.documentType.findMany();
    const documentTemplates = await prisma.documentTemplate.findMany();
    const documents = await prisma.document.findMany();

    return NextResponse.json({
      workspaces,
      projects,
      cycles,
      issues,
      pages,
      resources,
      resourceRequirements,
      folders,
      documentTypes,
      documentTemplates,
      documents
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { issues, pages, cycles, folders, documentTypes, documentTemplates, documents } = await request.json();

    // Sync Cycles
    if (cycles && Array.isArray(cycles)) {
      for (const cycle of cycles) {
        await prisma.cycle.upsert({
          where: { id: cycle.id },
          update: {
            name: cycle.name,
            startsAt: new Date(cycle.startsAt),
            endsAt: new Date(cycle.endsAt),
            projectId: cycle.projectId
          },
          create: {
            id: cycle.id,
            name: cycle.name,
            startsAt: new Date(cycle.startsAt),
            endsAt: new Date(cycle.endsAt),
            projectId: cycle.projectId
          }
        });
      }
    }

    // Sync Issues
    if (issues && Array.isArray(issues)) {
      for (const issue of issues) {
        await prisma.issue.upsert({
          where: { id: issue.id },
          update: {
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
            dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
            points: issue.points,
            projectId: issue.projectId,
            cycleId: issue.cycleId || null,
            pageId: issue.pageId || null
          },
          create: {
            id: issue.id,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
            dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
            points: issue.points,
            projectId: issue.projectId,
            cycleId: issue.cycleId || null,
            pageId: issue.pageId || null
          }
        });
      }
    }

    // Sync Pages
    if (pages && Array.isArray(pages)) {
      for (const page of pages) {
        await prisma.page.upsert({
          where: { id: page.id },
          update: {
            title: page.title,
            content: page.content,
            projectId: page.projectId
          },
          create: {
            id: page.id,
            title: page.title,
            content: page.content,
            projectId: page.projectId
          }
        });
      }
    }

    // Sync Folders
    if (folders && Array.isArray(folders)) {
      for (const folder of folders) {
        await prisma.folder.upsert({
          where: { id: folder.id },
          update: { name: folder.name, projectId: folder.projectId },
          create: { id: folder.id, name: folder.name, projectId: folder.projectId }
        });
      }
    }

    // Sync DocumentTypes
    if (documentTypes && Array.isArray(documentTypes)) {
      for (const dt of documentTypes) {
        await prisma.documentType.upsert({
          where: { id: dt.id },
          update: { name: dt.name },
          create: { id: dt.id, name: dt.name }
        });
      }
    }

    // Sync DocumentTemplates
    if (documentTemplates && Array.isArray(documentTemplates)) {
      for (const temp of documentTemplates) {
        await prisma.documentTemplate.upsert({
          where: { id: temp.id },
          update: { name: temp.name, content: temp.content, documentTypeId: temp.documentTypeId },
          create: { id: temp.id, name: temp.name, content: temp.content, documentTypeId: temp.documentTypeId }
        });
      }
    }

    // Sync Documents
    if (documents && Array.isArray(documents)) {
      for (const doc of documents) {
        // Validate Project exists
        let prjId = doc.projectId;
        const projectExists = await prisma.project.findUnique({ where: { id: prjId } });
        if (!projectExists) {
          const firstProj = await prisma.project.findFirst();
          if (firstProj) {
            prjId = firstProj.id;
          } else {
            continue; // Skip if no project is configured
          }
        }

        // Validate Folder exists
        let fldId = doc.folderId || null;
        if (fldId) {
          const folderExists = await prisma.folder.findUnique({ where: { id: fldId } });
          if (!folderExists) {
            fldId = null;
          }
        }

        // Validate DocumentType exists
        let typeId = doc.documentTypeId;
        const typeExists = await prisma.documentType.findUnique({ where: { id: typeId } });
        if (!typeExists) {
          const firstType = await prisma.documentType.findFirst();
          if (firstType) {
            typeId = firstType.id;
          } else {
            // Create inline to satisfy foreign key constraint if none exist
            await prisma.documentType.create({ data: { id: typeId, name: "General Spec" } });
          }
        }

        // Validate Template exists
        let tempId = doc.templateId || null;
        if (tempId) {
          const tempExists = await prisma.documentTemplate.findUnique({ where: { id: tempId } });
          if (!tempExists) {
            tempId = null;
          }
        }

        await prisma.document.upsert({
          where: { id: doc.id },
          update: {
            title: doc.title,
            content: doc.content,
            projectId: prjId,
            folderId: fldId,
            documentTypeId: typeId,
            templateId: tempId,
            prompt: doc.prompt || "",
            preparedBy: doc.preparedBy || "",
            createdDate: doc.createdDate || "",
            useTOC: doc.useTOC !== undefined ? doc.useTOC : true
          },
          create: {
            id: doc.id,
            title: doc.title,
            content: doc.content,
            projectId: prjId,
            folderId: fldId,
            documentTypeId: typeId,
            templateId: tempId,
            prompt: doc.prompt || "",
            preparedBy: doc.preparedBy || "",
            createdDate: doc.createdDate || "",
            useTOC: doc.useTOC !== undefined ? doc.useTOC : true
          }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
export async function DELETE(request: Request) {
  try {
    const { type, id } = await request.json();
    if (type === 'folder') {
      await prisma.folder.delete({ where: { id } });
    } else if (type === 'document') {
      await prisma.document.delete({ where: { id } });
    } else if (type === 'documentType') {
      await prisma.documentType.delete({ where: { id } });
    } else if (type === 'template') {
      await prisma.documentTemplate.delete({ where: { id } });
    } else if (type === 'issue') {
      await prisma.issue.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
