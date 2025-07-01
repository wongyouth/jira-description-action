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

const convertJiraTableToHtml = (text: string): string => {
  const lines = text.split('\n');
  const convertedLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a table header row (starts with ||)
    if (line.trim().startsWith('||')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }

      // Parse header row
      const headers = line.split('||').filter((cell) => cell.trim() !== '');
      const headerCells = headers.map((header) => `<th>${header.trim()}</th>`).join('');
      tableRows.push(`<tr>${headerCells}</tr>`);
    } else if (line.trim().startsWith('|') && inTable) {
      // Parse data row
      const cells = line.split('|').filter((cell) => cell.trim() !== '');
      const dataCells = cells.map((cell) => `<td>${cell.trim()}</td>`).join('');
      tableRows.push(`<tr>${dataCells}</tr>`);
    } else {
      // Not a table row
      if (inTable) {
        // End the table
        convertedLines.push('<table>');
        convertedLines.push('<thead>');
        convertedLines.push(tableRows[0]); // Header row
        convertedLines.push('</thead>');
        convertedLines.push('<tbody>');
        for (let j = 1; j < tableRows.length; j++) {
          convertedLines.push(tableRows[j]);
        }
        convertedLines.push('</tbody>');
        convertedLines.push('</table>');
        inTable = false;
        tableRows = [];
      }
      convertedLines.push(line);
    }
  }

  // Handle table at end of text
  if (inTable) {
    convertedLines.push('<table>');
    convertedLines.push('<thead>');
    convertedLines.push(tableRows[0]); // Header row
    convertedLines.push('</thead>');
    convertedLines.push('<tbody>');
    for (let j = 1; j < tableRows.length; j++) {
      convertedLines.push(tableRows[j]);
    }
    convertedLines.push('</tbody>');
    convertedLines.push('</table>');
  }

  return convertedLines.join('\n');
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

  // Convert JIRA smart links: [url|url|smart-link] -> [url](url)
  markdown = markdown.replace(/\[(https?:\/\/[^|\]]+)\|\1\|smart-link\]/g, '[$1]($1)');

  // Convert JIRA links: [text|url] -> [text](url)
  markdown = markdown.replace(/\[([^\]|\[]+?)\|([^\]|\[]+?)\]/g, '[$1]($2)');

  // Convert JIRA tables: ||header|| and |cell| -> HTML table
  markdown = convertJiraTableToHtml(markdown);

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

  // Step 2: Restore code blocks as Markdown code blocks
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
