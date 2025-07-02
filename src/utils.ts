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

export const buildPRDescription = async (details: JIRADetails, jiraBaseUrl?: string, jiraToken?: string) => {
  const displayKey = details.key.toUpperCase();

  // Process images if JIRA credentials are provided
  let processedDescription = details.description;
  if (jiraBaseUrl && jiraToken && details.description) {
    processedDescription = await processJiraImages(details.description, jiraBaseUrl, jiraToken);
  }

  return `<table><tbody><tr><td>
  <details>
    <summary>
      <a href="${details.url}" title="${displayKey}" target="_blank"><img alt="${details.type.name}" src="${details.type.icon}" /> ${displayKey}</a>
      ${details.summary}
    </summary>
    <br/>

${processedDescription}
  </details>
</td></tr></tbody></table>`;
};

// Function to extract and replace JIRA image paths with embedded base64 data
const processJiraImages = async (htmlDescription: string, jiraBaseUrl: string, jiraToken: string): Promise<string> => {
  // Extract image paths from HTML
  const imageRegex = /<img[^>]+src="([^"]*\/rest\/api\/[^"]*)"[^>]*>/gi;
  const matches: RegExpExecArray[] = [];
  let match;

  while ((match = imageRegex.exec(htmlDescription)) !== null) {
    matches.push(match);
  }

  if (matches.length === 0) {
    return htmlDescription; // No images to process
  }

  let processedHtml = htmlDescription;

  for (const match of matches) {
    const fullImgTag = match[0];
    const imagePath = match[1];

    try {
      // Download image from JIRA
      const imageUrl = `${jiraBaseUrl}${imagePath}`;
      const response = await fetch(imageUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(jiraToken).toString('base64')}`,
        },
      });

      if (!response.ok) {
        console.warn(`Failed to download image: ${imageUrl}`);
        continue;
      }

      const imageBuffer = await response.arrayBuffer();
      const imageData = Buffer.from(imageBuffer);

      // Convert to base64 and embed directly in the HTML
      const base64Data = imageData.toString('base64');
      const mimeType = 'image/png'; // You might want to detect this from the response headers

      // Replace the JIRA image path with embedded base64 data
      const embeddedImgTag = fullImgTag.replace(imagePath, `data:${mimeType};base64,${base64Data}`);
      processedHtml = processedHtml.replace(fullImgTag, embeddedImgTag);

      console.log(`Embedded image: ${imagePath} (${imageData.length} bytes)`);
    } catch (error) {
      console.error(`Error processing image ${imagePath}:`, error);
    }
  }

  return processedHtml;
};
