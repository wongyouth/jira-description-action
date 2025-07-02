import {
  BOT_BRANCH_PATTERNS,
  DEFAULT_BRANCH_PATTERNS,
  HIDDEN_MARKER_END,
  HIDDEN_MARKER_START,
  JIRA_REGEX_MATCHER,
  WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS,
} from './constants';
import { JIRADetails } from './types';
import sharp from 'sharp';

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

export const buildPRDescription = async (
  details: JIRADetails,
  jiraBaseUrl?: string,
  jiraToken?: string,
  githubToken?: string,
  owner?: string,
  repo?: string,
  prNumber?: number
) => {
  const displayKey = details.key.toUpperCase();

  // Process images if JIRA credentials are provided
  let processedDescription = details.description;
  if (jiraBaseUrl && jiraToken && details.description) {
    processedDescription = await processJiraImages(details.description, jiraBaseUrl, jiraToken, githubToken, owner, repo, prNumber);
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

  // Check if the PR description is too large (GitHub has a ~65KB character limit for PR descriptions)
  const maxDescriptionSize = 60 * 1024; // 60KB to be safe
  if (prDescription.length > maxDescriptionSize) {
    console.warn(
      `PR description is too large (${(prDescription.length / 1024).toFixed(2)}KB), truncating to ${(maxDescriptionSize / 1024).toFixed(2)}KB`
    );
    return prDescription.substring(0, maxDescriptionSize) + '\n\n... [Description truncated due to size limit]';
  }

  return prDescription;
};

// Function to extract and replace JIRA image paths with GitHub URLs or embedded base64 data
const processJiraImages = async (
  htmlDescription: string,
  jiraBaseUrl: string,
  jiraToken: string,
  githubToken?: string,
  owner?: string,
  repo?: string,
  prNumber?: number
): Promise<string> => {
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

      // Resize image if needed
      const resizedImageData = await resizeImageIfNeeded(imageData);

      // Try to upload to GitHub as PR comment attachment if credentials are provided
      if (githubToken && owner && repo && prNumber) {
        try {
          const filename = `jira-image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
          const githubImageUrl = await uploadImageViaTemporaryComment(resizedImageData, filename, githubToken, owner, repo, prNumber);

          if (githubImageUrl) {
            // Replace the JIRA image path with GitHub URL
            const newImgTag = fullImgTag.replace(imagePath, githubImageUrl);
            processedHtml = processedHtml.replace(fullImgTag, newImgTag);
            console.log(`Uploaded image to GitHub via temporary comment: ${imagePath} -> ${githubImageUrl}`);
            continue; // Skip base64 embedding
          }
        } catch (uploadError) {
          console.warn(`Failed to upload image to GitHub, falling back to base64: ${uploadError}`);
        }
      }

      // Fallback to base64 embedding
      const base64Data = resizedImageData.toString('base64');
      const mimeType = 'image/png';

      // Replace the JIRA image path with embedded base64 data
      const embeddedImgTag = fullImgTag.replace(imagePath, `data:${mimeType};base64,${base64Data}`);
      processedHtml = processedHtml.replace(fullImgTag, embeddedImgTag);

      console.log(`Embedded image: ${imagePath} (${resizedImageData.length} bytes)`);
    } catch (error) {
      console.error(`Error processing image ${imagePath}:`, error);
    }
  }

  return processedHtml;
};

// Function to resize image if it's too large (to keep base64 data manageable)
const resizeImageIfNeeded = async (imageData: Buffer): Promise<Buffer> => {
  const maxSizeBytes = 45 * 1024; // 45KB limit for base64 embedding (allows ~60KB base64 string, under 65,535 char limit)

  if (imageData.length <= maxSizeBytes) {
    return imageData; // No resizing needed
  }

  console.log(`Image too large (${(imageData.length / 1024 / 1024).toFixed(2)}MB), resizing...`);

  try {
    // Start with 80% quality and reduce dimensions if needed
    let quality = 80;
    let scale = 1.0;

    while (true) {
      const resized = await sharp(imageData)
        .resize(Math.round(1920 * scale), Math.round(1080 * scale), {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png({ quality })
        .toBuffer();

      if (resized.length <= maxSizeBytes || quality <= 20) {
        console.log(`Resized image to ${(resized.length / 1024 / 1024).toFixed(2)}MB (quality: ${quality}%, scale: ${scale})`);
        return resized;
      }

      // Reduce quality and scale for next iteration
      quality = Math.max(20, quality - 10);
      scale = Math.max(0.3, scale - 0.1);
    }
  } catch (error) {
    console.warn(`Failed to resize image, using original: ${error}`);
    return imageData;
  }
};

// Function to upload image using temporary comment strategy
const uploadImageViaTemporaryComment = async (
  imageData: Buffer,
  filename: string,
  githubToken: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> => {
  // Check file size (GitHub comment limit is ~65,535 characters)
  const base64Data = imageData.toString('base64');
  const dataUrl = `data:image/png;base64,${base64Data}`;

  if (dataUrl.length > 65000) {
    // Leave some buffer
    throw new Error(
      `Image too large for comment upload: ${(imageData.length / 1024).toFixed(2)}KB (would create ${
        dataUrl.length
      } character comment, limit: 65,535)`
    );
  }

  console.log(`Uploading image ${filename} (${(imageData.length / 1024).toFixed(2)}KB) via temporary comment...`);

  // Create a temporary comment with the image
  const commentBody = `![${filename}](${dataUrl})`;

  const createResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      body: commentBody,
    }),
  });

  if (!createResponse.ok) {
    const errorData = await createResponse.json().catch(() => ({}));
    const errorMessage = JSON.stringify(errorData);

    if (createResponse.status === 403) {
      throw new Error(`Insufficient permissions to create comments. Ensure the token has 'issues:write' permission.`);
    } else {
      throw new Error(`Failed to create temporary comment: ${createResponse.statusText} - ${errorMessage}`);
    }
  }

  const commentData = await createResponse.json();
  const commentId = commentData.id;

  console.log(`Created temporary comment ${commentId} with image`);

  // Extract the GitHub URL from the comment
  // GitHub automatically converts data URLs to their own URLs when the comment is created
  const githubImageUrl = extractImageUrlFromComment(commentData.body);

  if (!githubImageUrl) {
    // If we can't extract the URL, delete the comment and throw error
    await deleteComment(githubToken, owner, repo, commentId);
    throw new Error('Failed to extract image URL from comment response');
  }

  // Delete the temporary comment
  await deleteComment(githubToken, owner, repo, commentId);
  console.log(`Deleted temporary comment ${commentId}`);

  console.log(`Successfully uploaded image via temporary comment: ${githubImageUrl}`);
  return githubImageUrl;
};

// Function to delete a comment
const deleteComment = async (githubToken: string, owner: string, repo: string, commentId: number): Promise<void> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    console.warn(`Failed to delete temporary comment ${commentId}: ${response.statusText}`);
  }
};

// Function to extract image URL from comment body
const extractImageUrlFromComment = (commentBody: string): string | null => {
  // GitHub converts data URLs to their own URLs in comments
  // Look for the converted URL pattern
  const urlMatch = commentBody.match(/!\[.*?\]\((https:\/\/user-images\.githubusercontent\.com\/[^)]+)\)/);
  return urlMatch ? urlMatch[1] : null;
};
