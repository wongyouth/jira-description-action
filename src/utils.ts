import {
  BOT_BRANCH_PATTERNS,
  DEFAULT_BRANCH_PATTERNS,
  HIDDEN_MARKER_END,
  HIDDEN_MARKER_START,
  JIRA_REGEX_MATCHER,
  WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS,
} from './constants';
import { JIRADetails } from './types';
// Simple image resizing without external dependencies

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

  const prDescription = `<table><tbody><tr><td>
  <details>
    <summary>
      <a href="${details.url}" title="${displayKey}" target="_blank"><img alt="${details.type.name}" src="${details.type.icon}" /> ${displayKey}</a>
      ${details.summary}
    </summary>
    <br/>

${processedDescription}
  </details>
</td></tr></tbody></table>`;

  // Check if the PR description is too large (GitHub has a 65,535 character limit for PR descriptions)
  const maxDescriptionSize = 65535; // GitHub's character limit for PR descriptions
  if (prDescription.length > maxDescriptionSize) {
    console.warn(
      `PR description is too large (${(prDescription.length / 1024).toFixed(2)}KB), truncating to ${(maxDescriptionSize / 1024).toFixed(2)}KB`
    );
    return prDescription.substring(0, maxDescriptionSize) + '\n\n... [Description truncated due to size limit]';
  }

  return prDescription;
};

// Function to extract and replace JIRA image paths with embedded base64 data
const processJiraImages = async (htmlDescription: string, jiraBaseUrl: string, jiraToken: string): Promise<string> => {
  // Extract image paths from HTML
  const imageRegex = /<img[^>]+src="(\/rest\/api\/[^"]*)"[^>]*>/gi;
  const matches: RegExpExecArray[] = [];
  let match;

  while ((match = imageRegex.exec(htmlDescription)) !== null) {
    matches.push(match);
  }

  if (matches.length === 0) {
    return htmlDescription; // No images to process
  }

  let processedHtml = htmlDescription;
  const maxDescriptionSize = 65535; // GitHub's character limit for PR descriptions

  for (const match of matches) {
    const fullImgTag = match[0];
    const imagePath = match[1];

    console.log('found imagePath\n', imagePath);

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

      // Resize image if needed for base64 embedding
      const resizedImageData = await resizeImageIfNeeded(imageData);

      // Convert to base64 and embed directly in the HTML
      const base64Data = resizedImageData.toString('base64');
      const mimeType = 'image/png';

      // Create the embedded image tag
      const embeddedImgTag = fullImgTag.replace(imagePath, `data:${mimeType};base64,${base64Data}`);

      // Check if adding this image would exceed the description size limit
      const newProcessedHtml = processedHtml.replace(fullImgTag, embeddedImgTag);
      if (newProcessedHtml.length > maxDescriptionSize) {
        console.log(
          `Skipping image ${imagePath} - would exceed description size limit (${(newProcessedHtml.length / 1024).toFixed(2)}KB > ${(
            maxDescriptionSize / 1024
          ).toFixed(2)}KB)`
        );
        continue; // Skip this image to prevent overflow
      }

      // Replace the JIRA image path with embedded base64 data
      processedHtml = newProcessedHtml;
      console.log(`Embedded image: ${imagePath} (${resizedImageData.length} bytes)`);
    } catch (error) {
      console.error(`Error processing image ${imagePath}:`, error);
    }
  }

  return processedHtml;
};

// Function to resize images to 720p if larger and check size limits
const resizeImageIfNeeded = async (imageData: Buffer): Promise<Buffer> => {
  const maxSizeBytes = 45 * 1024; // 45KB limit for base64 embedding

  // For now, we'll use a simple approach since we don't have image processing libraries
  // In a real implementation, you'd want to use a library like sharp or jimp to resize images to 720p

  if (imageData.length <= maxSizeBytes) {
    return imageData; // No resizing needed
  }

  console.log(`Image too large (${(imageData.length / 1024 / 1024).toFixed(2)}MB), but resizing not available. Using original.`);

  // Return the original image - in a real implementation, this would be resized to 720p
  return imageData;
};
