// What's new: which sessions hear it. That VERSION matches plugin.json is checked in CI (test.yml): the test kit
// loads only code, not JSON.
import { expect, test } from 'claude-code/testing'

import { NEWS, NEWS_LONG, VERSION, newsFor } from './news'

test('the longer news names the version', () => {
  expect(NEWS_LONG).toContain(VERSION)
})

test('the news fits on a plank after "new: "', () => {
  expect(`new: ${NEWS}`.length).toBeLessThanOrEqual(22)
})

test('news comes after an update, not on a first install or a second look', () => {
  expect(newsFor(undefined, false, '0.23.0')).toBe('first')
  expect(newsFor(undefined, true, '0.23.0')).toBe('updated')
  expect(newsFor('0.22.1', true, '0.23.0')).toBe('updated')
  expect(newsFor('0.23.0', true, '0.23.0')).toBe('same')
  expect(newsFor('', false, '0.23.0')).toBe('first')
})
