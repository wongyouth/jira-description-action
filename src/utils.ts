import {
  BOT_BRANCH_PATTERNS,
  DEFAULT_BRANCH_PATTERNS,
  HIDDEN_MARKER_END,
  HIDDEN_MARKER_START,
  JIRA_REGEX_MATCHER,
  WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS,
} from './constants';
import { JIRADetails } from './types';

const getJIRAIssueKey = (input: string, regexp: RegExp = JIRA_REGEX_MATCHER): string | null => {
  const matches = regexp.exec(input);
  return matches ? matches[matches.length - 1] : null;
};

export const getJIRAIssueKeyByDefaultRegexp = (input: string): string | null => {
  const key = getJIRAIssueKey(input, new RegExp(JIRA_REGEX_MATCHER));
  return key ? key.toUpperCase() : null;
};

export const getJIRAIssueKeysByCustomRegexp = (input: string, numberRegexp: string, projectKey?: string): string | null => {
  const customRegexp = new RegExp(numberRegexp, 'gi');

  const ticketNumber = getJIRAIssueKey(input, customRegexp);
  if (!ticketNumber) {
    return null;
  }
  const key = projectKey ? `${projectKey}-${ticketNumber}` : ticketNumber;
  return key.toUpperCase();
};

export const shouldSkipBranch = (branch: string, additionalIgnorePattern?: string): boolean => {
  if (BOT_BRANCH_PATTERNS.some((pattern) => pattern.test(branch))) {
    console.log(`You look like a bot 🤖 so we're letting you off the hook!`);
    return true;
  }

  if (DEFAULT_BRANCH_PATTERNS.some((pattern) => pattern.test(branch))) {
    console.log(`Ignoring check for default branch ${branch}`);
    return true;
  }

  const ignorePattern = new RegExp(additionalIgnorePattern || '');
  if (!!additionalIgnorePattern && ignorePattern.test(branch)) {
    console.log(`branch '${branch}' ignored as it matches the ignore pattern '${additionalIgnorePattern}' provided in skip-branches`);
    return true;
  }

  return false;
};

const escapeRegexp = (str: string): string => {
  return str.replace(/[\\^$.|?*+(<>)[{]/g, '\\$&');
};

// Helper to split a JIRA table row into cells, ignoring | inside [] or {}
function splitJiraTableRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '[') bracketDepth++;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === '{') braceDepth++;
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
    if (char === '|' && bracketDepth === 0 && braceDepth === 0) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

const convertJiraTableToHtml = (text: string): { html: string; cellPlaceholders: string[] } => {
  // Preprocess: merge continuation lines with their table rows
  const lines = text.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const isTableRow = /^\|[^|]/.test(line) || trimmedLine.startsWith('||');

    if (isTableRow) {
      // Start of a table row - collect all continuation lines
      let fullRow = line;
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trim();
        const isNextTableRow = /^\|[^|]/.test(nextLine) || nextTrimmed.startsWith('||');
        const isContinuation = !isNextTableRow && !nextTrimmed.startsWith('|') && nextTrimmed !== '';

        if (isContinuation) {
          fullRow += '\n' + nextLine;
          j++;
        } else {
          break;
        }
      }
      processedLines.push(fullRow);
      i = j - 1; // Skip the continuation lines we just processed
    } else {
      processedLines.push(line);
    }
  }

  const convertedLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];
  let hasHeader = false;
  let currentRow: string[] = [];
  let placeholderIndex = 0;
  let allPlaceholders: string[] = [];
  let expectedColCount = 0;

  for (let i = 0; i < processedLines.length; i++) {
    const line = processedLines[i];
    const trimmedLine = line.trim();
    const isTableRow = /^\|[^|]/.test(line) || trimmedLine.startsWith('||');

    // Check if this is a table header row (starts with ||)
    if (trimmedLine.startsWith('||')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
        hasHeader = true;
        currentRow = [];
        placeholderIndex = 0;
      }
      // If currentRow has content, push it to tableRows before starting a new row
      if (currentRow.length > 0) {
        // Pad row if needed
        while (currentRow.length < expectedColCount) {
          currentRow.push('<td></td>');
        }
        tableRows.push(`<tr>${currentRow.join('')}</tr>`);
        currentRow = [];
      }
      let parts = splitJiraTableRow(line.replace(/^\|\|/, '').replace(/\|\|$/, ''));
      parts = parts.filter((cell) => cell.trim() !== '');
      expectedColCount = parts.length;
      for (let j = 0; j < parts.length; j++) {
        const cell = parts[j].trim();
        const placeholder = `JIRACELL${placeholderIndex}`;
        allPlaceholders.push(cell);
        currentRow.push(`<th>${placeholder}</th>`);
        placeholderIndex++;
      }
      continue;
    } else if (isTableRow && inTable) {
      // If currentRow has content, push it to tableRows before starting a new row
      if (currentRow.length > 0) {
        // Pad row if needed
        while (currentRow.length < expectedColCount) {
          currentRow.push('<td></td>');
        }
        tableRows.push(`<tr>${currentRow.join('')}</tr>`);
        currentRow = [];
      }
      let parts = splitJiraTableRow(line.replace(/^\|/, '').replace(/\|$/, ''));
      if (expectedColCount === 0) expectedColCount = parts.length;
      for (let j = 0; j < parts.length; j++) {
        let cell = parts[j].trim();
        const placeholder = `JIRACELL${placeholderIndex}`;
        allPlaceholders.push(cell);
        currentRow.push(`<td>${placeholder}</td>`);
        placeholderIndex++;
      }
      continue;
    } else if (isTableRow && !inTable) {
      inTable = true;
      tableRows = [];
      hasHeader = false;
      currentRow = [];
      placeholderIndex = 0;
      // If currentRow has content, push it to tableRows before starting a new row
      if (currentRow.length > 0) {
        // Pad row if needed
        while (currentRow.length < expectedColCount) {
          currentRow.push('<td></td>');
        }
        tableRows.push(`<tr>${currentRow.join('')}</tr>`);
        currentRow = [];
      }
      let parts = splitJiraTableRow(line.replace(/^\|/, '').replace(/\|$/, ''));
      expectedColCount = parts.length;
      for (let j = 0; j < parts.length; j++) {
        let cell = parts[j].trim();
        const placeholder = `JIRACELL${placeholderIndex}`;
        allPlaceholders.push(cell);
        currentRow.push(`<td>${placeholder}</td>`);
        placeholderIndex++;
      }
      continue;
    } else {
      // Not a table row
      if (inTable) {
        // If currentRow has content, push it to tableRows before ending the table
        if (currentRow.length > 0) {
          // Pad row if needed
          while (currentRow.length < expectedColCount) {
            currentRow.push('<td></td>');
          }
          tableRows.push(`<tr>${currentRow.join('')}</tr>`);
          currentRow = [];
        }
        // End the table
        convertedLines.push('<table>');
        if (hasHeader && tableRows.length > 0) {
          convertedLines.push('<thead>');
          convertedLines.push(tableRows[0]); // Header row
          convertedLines.push('</thead>');
          convertedLines.push('<tbody>');
          for (let j = 1; j < tableRows.length; j++) {
            convertedLines.push(tableRows[j]);
          }
          convertedLines.push('</tbody>');
        } else {
          convertedLines.push('<tbody>');
          for (let j = 0; j < tableRows.length; j++) {
            convertedLines.push(tableRows[j]);
          }
          convertedLines.push('</tbody>');
        }
        convertedLines.push('</table>');
        inTable = false;
        tableRows = [];
        hasHeader = false;
        currentRow = [];
        placeholderIndex = 0;
        expectedColCount = 0;
      }
      convertedLines.push(line);
    }
  }

  // Handle table at end of text
  if (inTable) {
    // If currentRow has content, push it to tableRows before ending the table
    if (currentRow.length > 0) {
      // Pad row if needed
      while (currentRow.length < expectedColCount) {
        currentRow.push('<td></td>');
      }
      tableRows.push(`<tr>${currentRow.join('')}</tr>`);
      currentRow = [];
    }
    convertedLines.push('<table>');
    if (hasHeader && tableRows.length > 0) {
      convertedLines.push('<thead>');
      convertedLines.push(tableRows[0]); // Header row
      convertedLines.push('</thead>');
      convertedLines.push('<tbody>');
      for (let j = 1; j < tableRows.length; j++) {
        convertedLines.push(tableRows[j]);
      }
      convertedLines.push('</tbody>');
    } else {
      convertedLines.push('<tbody>');
      for (let j = 0; j < tableRows.length; j++) {
        convertedLines.push(tableRows[j]);
      }
      convertedLines.push('</tbody>');
    }
    convertedLines.push('</table>');
  }

  return { html: convertedLines.join('\n'), cellPlaceholders: allPlaceholders };
};

const convertJiraMarkupToMarkdown = (jiraText: string): string => {
  if (!jiraText) return jiraText;

  let markdown = jiraText;

  // Step 1: Extract code blocks and replace with placeholders
  const codeBlocks: string[] = [];
  markdown = markdown.replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, (_, code) => {
    codeBlocks.push(code);
    return `JIRACODEBLOCK${codeBlocks.length - 1}`;
  });

  // Convert JIRA tables: ||header|| and |cell| -> HTML table (before formatting conversions)
  let tableResult = convertJiraTableToHtml(markdown);
  markdown = tableResult.html;

  // Restore cell content from placeholders and apply formatting (immediately after table HTML)
  if (tableResult.cellPlaceholders.length > 0) {
    for (let i = 0; i < tableResult.cellPlaceholders.length; i++) {
      let cellContent = tableResult.cellPlaceholders[i];
      // Apply formatting conversions to cell content
      cellContent = cellContent.replace(/\[(https?:\/\/[^|\]]+)\|\1\|smart-link\]/g, '[$1]($1)');
      cellContent = cellContent.replace(/\[([^\]|\[]+?)\|([^\]|\[]+?)\]/g, '[$1]($2)');
      cellContent = cellContent.replace(/\{color:([^}]+)\}([\s\S]*?)\{color\}/g, '<span style="color:$1">$2</span>');
      cellContent = cellContent.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '**$1**');
      cellContent = cellContent.replace(/(?<!_)_([^_]+)_(?!_)/g, '*$1*');
      // Ordered list conversion for table cells
      cellContent = cellContent.replace(/^(#+)\s/gm, (_, hashes) => {
        const level = hashes.length;
        const indent = '  '.repeat(level - 1);
        return indent + '1. ';
      });
      markdown = markdown.replace(`JIRACELL${i}`, cellContent);
    }
  }

  // Now apply all other formatting conversions
  // Convert JIRA smart links: [url|url|smart-link] -> [url](url)
  markdown = markdown.replace(/\[(https?:\/\/[^|\]]+)\|\1\|smart-link\]/g, '[$1]($1)');

  // Convert JIRA links: [text|url] -> [text](url)
  markdown = markdown.replace(/\[([^\]|\[]+?)\|([^\]|\[]+?)\]/g, '[$1]($2)');

  // Convert ordered lists: # -> 1., ## ->   1., ### ->     1., etc. (must be first to avoid conflict with headings)
  markdown = markdown.replace(/^(#{1,6})\s/gm, (_, hashes) => {
    const level = hashes.length;
    const indent = '  '.repeat(level - 1);
    return indent + '1. ';
  });

  // Convert headings: h1. -> #, h2. -> ##, h3. -> ###, h4. -> ####, h5. -> #####, h6. -> ######
  markdown = markdown.replace(/^h([1-6])\.\s*/gm, (_, level) => '#'.repeat(parseInt(level)) + ' ');

  // Convert color formatting: {color:#color}text{color} -> <span style="color:#color">text</span>
  markdown = markdown.replace(/\{color:([^}]+)\}([\s\S]*?)\{color\}/g, '<span style="color:$1">$2</span>');

  // Convert bold text: *text* -> **text** (but only if it's not part of a list)
  markdown = markdown.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '**$1**');

  // Convert italic text: _text_ -> *text*
  markdown = markdown.replace(/(?<!_)_([^_]+)_(?!_)/g, '*$1*');

  // Convert lists: * -> - for first level, ** ->   - for second level, etc.
  markdown = markdown.replace(/^(\*+)\s/gm, (_, stars) => {
    const level = stars.length;
    const indent = '  '.repeat(level - 1);
    return indent + '- ';
  });

  // Step 2: Restore code blocks as Markdown code blocks (after all formatting)
  markdown = markdown.replace(/JIRACODEBLOCK(\d+)/g, (_, idx) => {
    const code = codeBlocks[parseInt(idx, 10)].replace(/^\n+|\n+$/g, '');
    return `\`\`\`\n${code}\n\`\`\``;
  });

  return markdown;
};

export const getPRDescription = (oldBody: string, details: string): string => {
  const hiddenMarkerStartRg = escapeRegexp(HIDDEN_MARKER_START);
  const hiddenMarkerEndRg = escapeRegexp(HIDDEN_MARKER_END);
  const warningMsgRg = escapeRegexp(WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS);

  const replaceDetailsRg = new RegExp(`${hiddenMarkerStartRg}([\\s\\S]+)${hiddenMarkerEndRg}[\\s]?`, 'igm');
  const replaceWarningMessageRg = new RegExp(`${warningMsgRg}[\\s]?`, 'igm');
  const jiraDetailsMessage = `${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${details}
${HIDDEN_MARKER_END}
`;
  if (replaceDetailsRg.test(oldBody)) {
    return (oldBody ?? '').replace(replaceWarningMessageRg, '').replace(replaceDetailsRg, jiraDetailsMessage);
  }
  return jiraDetailsMessage + oldBody;
};

export const buildPRDescription = (details: JIRADetails) => {
  const displayKey = details.key.toUpperCase();
  const convertedDescription = details.description ? convertJiraMarkupToMarkdown(details.description) : '';

  return `<table><tbody><tr><td>
  <details>
    <summary>
      <a href="${details.url}" title="${displayKey}" target="_blank"><img alt="${details.type.name}" src="${details.type.icon}" /> ${displayKey}</a>
      ${details.summary}
    </summary>
    <br/>

${convertedDescription}
  </details>
</td></tr></tbody></table>`;
};
