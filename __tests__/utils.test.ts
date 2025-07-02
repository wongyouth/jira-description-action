import { HIDDEN_MARKER_END, HIDDEN_MARKER_START, WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS } from '../src/constants';
import { JIRADetails } from '../src/types';
import { getJIRAIssueKeyByDefaultRegexp, getJIRAIssueKeysByCustomRegexp, getPRDescription, shouldSkipBranch, buildPRDescription } from '../src/utils';

jest.spyOn(console, 'log').mockImplementation(); // avoid actual console.log in test output

describe('shouldSkipBranch()', () => {
  it('should recognize bot PRs', () => {
    expect(shouldSkipBranch('dependabot/npm_and_yarn/types/react-dom-16.9.6')).toBe(true);
    expect(shouldSkipBranch('feature/add-dependabot-config')).toBe(false);
  });

  it('should handle custom ignore patterns', () => {
    expect(shouldSkipBranch('bar', '^bar')).toBeTruthy();
    expect(shouldSkipBranch('foobar', '^bar')).toBeFalsy();

    expect(shouldSkipBranch('bar', '[0-9]{2}')).toBeFalsy();
    expect(shouldSkipBranch('bar', '')).toBeFalsy();
    expect(shouldSkipBranch('f00', '[0-9]{2}')).toBeTruthy();

    const customBranchRegex = '^(production-release|master|release/v\\d+)$';

    expect(shouldSkipBranch('production-release', customBranchRegex)).toBeTruthy();
    expect(shouldSkipBranch('master', customBranchRegex)).toBeTruthy();
    expect(shouldSkipBranch('release/v77', customBranchRegex)).toBeTruthy();

    expect(shouldSkipBranch('release/very-important-feature', customBranchRegex)).toBeFalsy();
    expect(shouldSkipBranch('')).toBeFalsy();
  });
});

describe('getJIRAIssueKeys()', () => {
  it('gets jira key from different strings', () => {
    expect(getJIRAIssueKeyByDefaultRegexp('fix/login-protocol-es-43')).toEqual('ES-43');
    expect(getJIRAIssueKeyByDefaultRegexp('fix/login-protocol-ES-43')).toEqual('ES-43');
    expect(getJIRAIssueKeyByDefaultRegexp('[ES-43, ES-15] Feature description')).toEqual('ES-43');

    expect(getJIRAIssueKeyByDefaultRegexp('feature/missingKey')).toEqual(null);
    expect(getJIRAIssueKeyByDefaultRegexp('')).toEqual(null);
  });
});

describe('getJIRAIssueKeysByCustomRegexp() gets jira keys from different strings', () => {
  it('with project name', () => {
    expect(getJIRAIssueKeysByCustomRegexp('law-18,345', '^LAW-??(\\d+)', 'LAW')).toEqual('LAW-18');
    //expect(getJIRAIssueKeysByCustomRegexp('fix/login-protocol-es-43', '^\\d+', 'QQ')).toEqual(null);
    //expect(getJIRAIssueKeysByCustomRegexp('43-login-protocol', '^\\d+', 'QQ')).toEqual('QQ-43');
  });

  it('without project name', () => {
    expect(getJIRAIssueKeysByCustomRegexp('18,345', '\\d+')).toEqual('18');
    expect(getJIRAIssueKeysByCustomRegexp('fix/login-protocol-es-43', 'es-\\d+')).toEqual('ES-43');
  });

  it('with grouped value in regexp', () => {
    expect(getJIRAIssueKeysByCustomRegexp('fix/login-protocol-es-43', '(es-\\d+)$')).toEqual('ES-43');
    expect(getJIRAIssueKeysByCustomRegexp('fix/login-20-in-14', '-(IN-\\d+)')).toEqual('IN-14');
    expect(getJIRAIssueKeysByCustomRegexp('fix/login-20-in-14', 'in-(\\d+)', 'PRJ')).toEqual('PRJ-20');
  });
});

describe('getPRDescription()', () => {
  it('should prepend issue info with hidden markers to old PR body', () => {
    const oldPRBody = 'old PR description body';
    const issueInfo = 'new info about jira task';
    const description = getPRDescription(oldPRBody, issueInfo);

    expect(description).toEqual(`${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${issueInfo}
${HIDDEN_MARKER_END}
${oldPRBody}`);
  });

  it('should replace issue info', () => {
    const oldPRBodyInformation = 'old PR description body';
    const oldPRBody = `${HIDDEN_MARKER_START}Here is some old issue information${HIDDEN_MARKER_END}${oldPRBodyInformation}`;
    const issueInfo = 'new info about jira task';

    const description = getPRDescription(oldPRBody, issueInfo);

    expect(description).toEqual(`${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${issueInfo}
${HIDDEN_MARKER_END}
${oldPRBodyInformation}`);
  });

  it('does not duplicate WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS in the body when run multiple times', () => {
    const oldPRBodyInformation = 'old PR description body';
    const oldPRBody = `${HIDDEN_MARKER_START}Here is some old issue information${HIDDEN_MARKER_END}${oldPRBodyInformation}`;
    const issueInfo = 'new info about jira task';

    const firstDescription = getPRDescription(oldPRBody, issueInfo);
    const secondDescription = getPRDescription(firstDescription, issueInfo);

    expect(secondDescription).toEqual(`${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${issueInfo}
${HIDDEN_MARKER_END}
${oldPRBodyInformation}`);
  });

  it('respects the location of HIDDEN_MARKER_START and HIDDEN_MARKER_END when they already exist in the pull request body', () => {
    const issueInfo = 'new info about jira task';
    const oldPRDescription = `this is text above the markers
${WARNING_MESSAGE_ABOUT_HIDDEN_MARKERS}
${HIDDEN_MARKER_START}
${issueInfo}
${HIDDEN_MARKER_END}
this is text below the markers`;
    const description = getPRDescription(oldPRDescription, issueInfo);
    expect(description).toEqual(oldPRDescription);
  });
});

describe('buildPRDescription()', () => {
  it('should return description HTML from the JIRA details', async () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: '<ul><li>abc</li></ul>',
      url: 'example.com/ABC-123',
      type: {
        name: 'story',
        icon: 'icon.png',
      },
      project: {
        name: 'name',
        url: 'url',
        key: 'key',
      },
    };

    expect(await buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

<ul><li>abc</li></ul>
  </details>
</td></tr></tbody></table>`);
  });

  it('should handle JIRA images by embedding them as base64 data', async () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `<h4>Image Example</h4>
<p>Here is a screenshot:</p>
<img src="/rest/api/3/attachment/content/356095" alt="screenshot.png" width="75%" style="border: 0px solid black" />
<p>And another image:</p>
<img src="/rest/api/3/attachment/content/356096" alt="diagram.png" />`,
      url: 'example.com/ABC-123',
      type: {
        name: 'story',
        icon: 'icon.png',
      },
      project: {
        name: 'name',
        url: 'url',
        key: 'key',
      },
    };

    // Mock fetch to return fake image data
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/rest/api/3/attachment/content/')) {
        // Create fake PNG image data (minimal valid PNG)
        const fakePngData = Buffer.from([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a, // PNG signature
          0x00,
          0x00,
          0x00,
          0x0d, // IHDR chunk length
          0x49,
          0x48,
          0x44,
          0x52, // IHDR
          0x00,
          0x00,
          0x00,
          0x01, // width: 1
          0x00,
          0x00,
          0x00,
          0x01, // height: 1
          0x08,
          0x02,
          0x00,
          0x00,
          0x00, // bit depth, color type, etc.
          0x90,
          0x77,
          0x53,
          0xde, // CRC
          0x00,
          0x00,
          0x00,
          0x0c, // IDAT chunk length
          0x49,
          0x44,
          0x41,
          0x54, // IDAT
          0x08,
          0x99,
          0x01,
          0x01,
          0x00,
          0x00,
          0x00,
          0xff,
          0xff,
          0x00,
          0x00,
          0x00,
          0x02,
          0x00,
          0x01, // compressed data
          0x00,
          0x00,
          0x00,
          0x00, // IEND chunk length
          0x49,
          0x45,
          0x4e,
          0x44, // IEND
          0xae,
          0x42,
          0x60,
          0x82, // CRC
        ]);

        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'image/png']]) as any,
          redirected: false,
          type: 'default' as ResponseType,
          url: url,
          arrayBuffer: () => Promise.resolve(fakePngData.buffer),
          body: null,
          bodyUsed: false,
          clone: () => new Response(),
          formData: () => Promise.resolve(new FormData()),
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
          blob: () => Promise.resolve(new Blob()),
        } as Response);
      }
      return originalFetch(url);
    });

    try {
      const result = await buildPRDescription(details, 'https://jira.example.com', 'fake-token');

      // Verify that image paths were replaced with base64 data
      expect(result).toContain('data:image/png;base64,');
      expect(result).not.toContain('/rest/api/3/attachment/content/356095');
      expect(result).not.toContain('/rest/api/3/attachment/content/356096');
      expect(result).toContain('screenshot.png');
      expect(result).toContain('diagram.png');

      // Verify the structure is correct
      expect(result).toContain('<h4>Image Example</h4>');
      expect(result).toContain('<p>Here is a screenshot:</p>');
      expect(result).toContain('<p>And another image:</p>');

      // Verify that fetch was called for both images
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith('https://jira.example.com/rest/api/3/attachment/content/356095', expect.any(Object));
      expect(global.fetch).toHaveBeenCalledWith('https://jira.example.com/rest/api/3/attachment/content/356096', expect.any(Object));
    } finally {
      // Restore original fetch
      global.fetch = originalFetch;
    }
  });

  it('should handle missing images gracefully', async () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `<h4>Missing Image Example</h4>
<p>Here is a missing image:</p>
<img src="/rest/api/3/attachment/content/999999" alt="missing.png" />`,
      url: 'example.com/ABC-123',
      type: {
        name: 'story',
        icon: 'icon.png',
      },
      project: {
        name: 'name',
        url: 'url',
        key: 'key',
      },
    };

    // Mock console.warn to prevent warnings in test output
    const originalWarn = console.warn;
    console.warn = jest.fn();

    // Mock fetch to return 404 for missing image
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/rest/api/3/attachment/content/999999')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response);
      }
      return originalFetch(url);
    });

    try {
      const result = await buildPRDescription(details, 'https://jira.example.com', 'fake-token');

      // Verify that the original image path is preserved when image is not found
      expect(result).toContain('/rest/api/3/attachment/content/999999');
      expect(result).toContain('missing.png');
      expect(result).toContain('<h4>Missing Image Example</h4>');

      // Verify that console.warn was called for the failed image
      expect(console.warn).toHaveBeenCalledWith('Failed to download image: https://jira.example.com/rest/api/3/attachment/content/999999');
    } finally {
      // Restore original fetch and console.warn
      global.fetch = originalFetch;
      console.warn = originalWarn;
    }
  });
});
