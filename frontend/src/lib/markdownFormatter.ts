/**
 * Beautifies raw Markdown text to make it neat, clean, and structured.
 * Formats and aligns tables, cleans headings, standardizes lists, and cleans blank lines.
 */
export function beautifyMarkdown(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split(/\r?\n/);
  const formattedLines: string[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Detect and format Tables
    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }

      const formattedTable = beautifyTable(tableLines);
      formattedLines.push(...formattedTable);
      continue;
    }

    // 2. Format Headings (e.g. ##Heading -> ## Heading)
    const headingMatch = line.match(/^(\s*)(#{1,6})\s*(.*)$/);
    if (headingMatch) {
      const indent = headingMatch[1] || '';
      const hashes = headingMatch[2];
      const title = headingMatch[3].trim();
      formattedLines.push(`${indent}${hashes} ${title}`);
      i++;
      continue;
    }

    // 3. Format Lists (ensure space after bullet/number)
    const listMatch = line.match(/^(\s*)([\*\-\+])\s*(.*)$/);
    const numListMatch = line.match(/^(\s*)(\d+\.)\s*(.*)$/);
    if (listMatch) {
      const indent = listMatch[1] || '';
      const bullet = listMatch[2];
      const content = listMatch[3].trim();
      formattedLines.push(`${indent}${bullet} ${content}`);
      i++;
      continue;
    } else if (numListMatch) {
      const indent = numListMatch[1] || '';
      const num = numListMatch[2];
      const content = numListMatch[3].trim();
      formattedLines.push(`${indent}${num} ${content}`);
      i++;
      continue;
    }

    // 4. Standardize Horizontal Rules
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      formattedLines.push('---');
      i++;
      continue;
    }

    // 5. Default Line spacing and cleaning
    formattedLines.push(line.trimRight());
    i++;
  }

  // 6. Post-processing: remove duplicate empty lines
  const cleanLines: string[] = [];
  let prevEmpty = false;
  
  for (const line of formattedLines) {
    const isEmpty = line.trim() === '';
    if (isEmpty) {
      if (!prevEmpty) {
        cleanLines.push('');
      }
      prevEmpty = true;
    } else {
      cleanLines.push(line);
      prevEmpty = false;
    }
  }

  return cleanLines.join('\n');
}

/**
 * Aligns columns of a Markdown table vertically.
 */
function beautifyTable(tableLines: string[]): string[] {
  if (tableLines.length === 0) return [];

  // Parse rows and cell values
  const parsedRows = tableLines.map(line => {
    // split by | but keep empty strings for leading/trailing parts
    const parts = line.split('|');
    // If the line starts and ends with |, the first and last parts will be empty
    return parts.map(cell => cell.trim());
  });

  // Determine column counts
  const colCount = Math.max(...parsedRows.map(row => row.length));
  const colWidths = new Array(colCount).fill(0);

  // Compute maximum cell width for each column (excluding header alignment lines)
  parsedRows.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      // Don't count separator line widths (e.g. :---, ---:) in width calculations
      const isSeparator = rowIdx === 1 && cell.includes('-');
      if (!isSeparator && cell.length > colWidths[colIdx]) {
        colWidths[colIdx] = cell.length;
      }
    });
  });

  // Rebuild the table with padded cells
  const formattedRows = parsedRows.map((row, rowIdx) => {
    const isSeparatorRow = rowIdx === 1;
    
    const formattedCells = row.map((cell, colIdx) => {
      // Don't format the leading/trailing empty cells from splitting
      if (colIdx === 0 || colIdx === row.length - 1) return '';

      const targetWidth = colWidths[colIdx] || 3;

      if (isSeparatorRow && cell.includes('-')) {
        // Re-generate nice separator line with alignment preservation
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        let dashes = '-'.repeat(Math.max(3, targetWidth - (left ? 1 : 0) - (right ? 1 : 0)));
        return (left ? ':' : '') + dashes + (right ? ':' : '');
      }

      // Standard cell padding
      return ' ' + cell.padEnd(targetWidth) + ' ';
    });

    // Rejoin the cells with pipes
    // Handle cases where the original row did not start/end with |
    const startsWithPipe = tableLines[rowIdx].trim().startsWith('|');
    const endsWithPipe = tableLines[rowIdx].trim().endsWith('|');

    let outputLine = formattedCells.join('|').trim();
    if (startsWithPipe && !outputLine.startsWith('|')) outputLine = '|' + outputLine;
    if (endsWithPipe && !outputLine.endsWith('|')) outputLine = outputLine + '|';
    
    return outputLine;
  });

  return formattedRows;
}
