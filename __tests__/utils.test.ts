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
  ### <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
  Sample summary

  This is a sample description for the JIRA issue. It contains details about the task and what needs to be accomplished.
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
  ### <a href="example.com/ABC-123" title="ABC-123" target="_blank"><img alt="story" src="icon.png" /> ABC-123</a>
  Sample summary

  #### Column 1

  - Campus：**[ REFERRING NOW. ]**
  - Primary：**[ REFERRING NOW. ]**
  - Middle：**[ REFERRING NOW. ]**
  - Secondary：**[ REFERRING NOW. ]**

#### Column 2

  - -Tags：-**[ HOLD ]**

#### Column 3 **[ NEW ]**

  - Payment
  - Invoice Status
    - Outstanding、Support multiple selection, all displayed(the picture is just an example of showing
</td></tr></tbody></table>`);
  });
});
