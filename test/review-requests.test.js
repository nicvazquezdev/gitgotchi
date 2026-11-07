const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { requestInfo } = require('../src/main/github/review-requests');

const me = { login: 'me', teams: ['acme/ui', 'acme/code'] };
const user = (login) => ({ __typename: 'User', login });
const team = (combinedSlug) => ({ __typename: 'Team', combinedSlug });
const bot = { __typename: 'Bot' };
const event = (createdAt, requestedReviewer) => ({ createdAt, requestedReviewer });
const pending = (...reviewers) => reviewers;

describe('requestInfo', () => {
  test('a request to the user: the date of their latest request, no team', () => {
    const info = requestInfo(
      {
        pending: pending(user('me'), user('someone')),
        events: [
          event('2026-06-10T00:00:00Z', user('me')),
          event('2026-06-14T00:00:00Z', user('me')),
          event('2026-06-01T00:00:00Z', user('someone')),
        ],
      },
      me,
    );
    assert.deepEqual(info, { requestedAt: '2026-06-14T00:00:00Z', via: null });
  });

  test('a request to one of the user teams says which team', () => {
    const info = requestInfo(
      { pending: pending(team('acme/ui')), events: [event('2026-06-12T00:00:00Z', team('acme/ui'))] },
      me,
    );
    assert.deepEqual(info, { requestedAt: '2026-06-12T00:00:00Z', via: 'acme/ui' });
  });

  test('a request to a team the user is not in is not theirs: nothing is claimed', () => {
    const info = requestInfo(
      { pending: pending(team('acme/other')), events: [event('2026-06-12T00:00:00Z', team('acme/other'))] },
      me,
    );
    assert.deepEqual(info, { requestedAt: null, via: null });
  });

  test('asked directly and through a team: the one that has waited the longest', () => {
    const events = [event('2026-06-05T00:00:00Z', team('acme/ui')), event('2026-06-14T00:00:00Z', user('me'))];
    assert.deepEqual(requestInfo({ pending: pending(user('me'), team('acme/ui')), events }, me), {
      requestedAt: '2026-06-05T00:00:00Z',
      via: 'acme/ui',
    });
    const newer = [event('2026-06-15T00:00:00Z', team('acme/ui')), event('2026-06-14T00:00:00Z', user('me'))];
    assert.deepEqual(requestInfo({ pending: pending(user('me'), team('acme/ui')), events: newer }, me), {
      requestedAt: '2026-06-14T00:00:00Z',
      via: null,
    });
  });

  test('a request that is no longer open is ignored, even when its event is there', () => {
    // The user was asked on the 1st and the request was removed; only a team is asked now.
    const info = requestInfo(
      {
        pending: pending(team('acme/code')),
        events: [event('2026-06-01T00:00:00Z', user('me')), event('2026-06-09T00:00:00Z', team('acme/code'))],
      },
      me,
    );
    assert.deepEqual(info, { requestedAt: '2026-06-09T00:00:00Z', via: 'acme/code' });
  });

  test('asked now but the event is out of the window: the team is known, the date is not', () => {
    const info = requestInfo(
      { pending: pending(team('acme/code')), events: [event('2026-06-01T00:00:00Z', user('x'))] },
      me,
    );
    assert.deepEqual(info, { requestedAt: null, via: 'acme/code' });
    assert.deepEqual(requestInfo({ pending: pending(user('me')), events: [] }, me), { requestedAt: null, via: null });
  });

  test('logins and team names are compared ignoring case; bots and odd reviewers are ignored', () => {
    const info = requestInfo(
      {
        pending: pending(bot, null, { __typename: 'Team' }, user('ME')),
        events: [event('2026-06-14T00:00:00Z', user('Me')), event('2026-06-02T00:00:00Z', bot)],
      },
      { login: 'Me', teams: new Set(['ACME/UI']) },
    );
    assert.deepEqual(info, { requestedAt: '2026-06-14T00:00:00Z', via: null });
    assert.deepEqual(
      requestInfo(
        { pending: pending(team('Acme/UI')), events: [event('2026-06-03T00:00:00Z', team('ACME/ui'))] },
        { login: 'x', teams: ['acme/ui'] },
      ),
      { requestedAt: '2026-06-03T00:00:00Z', via: 'acme/ui' },
    );
  });

  test('no data at all gives nothing, without failing', () => {
    assert.deepEqual(requestInfo({}, me), { requestedAt: null, via: null });
    assert.deepEqual(requestInfo({ pending: [], events: [] }, { login: 'me', teams: [] }), {
      requestedAt: null,
      via: null,
    });
  });
});
