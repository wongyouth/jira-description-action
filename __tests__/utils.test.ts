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
  it('should return description HTML from the JIRA details', () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: 'This is a sample description for the JIRA issue. It contains details about the task and what needs to be accomplished.',
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

    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

This is a sample description for the JIRA issue. It contains details about the task and what needs to be accomplished.
  </details>
</td></tr></tbody></table>`);
  });

  it('should convert JIRA markup to Markdown format', () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `h4. Column 1

* Campus：{color:#36B37E}*[ REFERRING NOW. ]*{color}
* Primary：{color:#36B37E}*[ REFERRING NOW. ]*{color}
* Middle：{color:#36B37E}*[ REFERRING NOW. ]*{color}
* Secondary：{color:#36B37E}*[ REFERRING NOW. ]*{color}

h4. Column 2

* -Tags：-{color:#97A0AF}*[ HOLD ]*{color}

h4. Column 3 {color:#FF5630}*[ NEW ]*{color}

* Payment
** Invoice Status
*** Outstanding{color:#ff5630}、Support multiple selection, all displayed{color}(the picture is just an example of showing`,
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

    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

#### Column 1

  - Campus：<span style="color:#36B37E">**[ REFERRING NOW. ]**</span>
  - Primary：<span style="color:#36B37E">**[ REFERRING NOW. ]**</span>
  - Middle：<span style="color:#36B37E">**[ REFERRING NOW. ]**</span>
  - Secondary：<span style="color:#36B37E">**[ REFERRING NOW. ]**</span>

#### Column 2

  - -Tags：-<span style="color:#97A0AF">**[ HOLD ]**</span>

#### Column 3 <span style="color:#FF5630">**[ NEW ]**</span>

  - Payment
  - Invoice Status
    - Outstanding<span style="color:#ff5630">、Support multiple selection, all displayed</span>(the picture is just an example of showing
  </details>
</td></tr></tbody></table>`);
  });

  it('should convert JIRA ordered lists to Markdown format', () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `h4. Ordered List Example

# First level item
## Second level item
### Third level item
# Another first level item
## Another second level item`,
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

    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

#### Ordered List Example

1. First level item
  1. Second level item
    1. Third level item
1. Another first level item
  1. Another second level item
  </details>
</td></tr></tbody></table>`);
  });

  it('should convert JIRA italic text to Markdown format', () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `h4. Text Formatting Example

This is _italic text_ and this is *bold text*.
Here's some _more italic_ and *more bold* text.
This text has _italic_ and *bold* mixed together.`,
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

    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

#### Text Formatting Example

This is *italic text* and this is **bold text**.
Here's some *more italic* and **more bold** text.
This text has *italic* and **bold** mixed together.
  </details>
</td></tr></tbody></table>`);
  });

  it('should convert JIRA links to Markdown format', () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `h4. Link Example

[Google|https://google.com]
[https://fariaedu.atlassian.net/browse/OA-25099|https://fariaedu.atlassian.net/browse/OA-25099|smart-link]`,
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

    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

#### Link Example

[Google](https://google.com)
[https://fariaedu.atlassian.net/browse/OA-25099](https://fariaedu.atlassian.net/browse/OA-25099)
  </details>
</td></tr></tbody></table>`);
  });

  it('should convert JIRA color markup to HTML span tags', () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `h4. Color Example

This is {color:#36B37E}green text{color} and this is {color:#FF5630}red text{color}.
Here's some {color:#97A0AF}gray text{color} mixed with normal text.`,
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

    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

#### Color Example

This is <span style="color:#36B37E">green text</span> and this is <span style="color:#FF5630">red text</span>.
Here's some <span style="color:#97A0AF">gray text</span> mixed with normal text.
  </details>
</td></tr></tbody></table>`);
  });

  it('should convert JIRA table markup to HTML table format', () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `h4. Table Example

||*h1*||*h2*||*h3*||
|r11|r12|r13|
|r21|r22|r23|`,
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

    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

#### Table Example

<table>
<thead>
<tr><th>**h1**</th><th>**h2**</th><th>**h3**</th></tr>
</thead>
<tbody>
<tr><td>r11</td><td>r12</td><td>r13</td></tr>
<tr><td>r21</td><td>r22</td><td>r23</td></tr>
</tbody>
</table>
  </details>
</td></tr></tbody></table>`);
  });

  it('should convert JIRA code block markup to HTML pre and code tags', () => {
    const details: JIRADetails = {
      key: 'ABC-123',
      summary: 'Sample summary',
      description: `h4. Code Example

{noformat}
# coding
this is code line
function hello() {
    console.log("Hello World");
}
{noformat}`,
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

    expect(buildPRDescription(details)).toEqual(`<table><tbody><tr><td>
  <details>
    <summary>
      <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
      Sample summary
    </summary>
    <br/>

#### Code Example

\`\`\`
# coding
this is code line
function hello() {
    console.log("Hello World");
}
\`\`\`
  </details>
</td></tr></tbody></table>`);
  });
});
