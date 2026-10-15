import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registrationStateOf, type RegistrationWindow } from '../src/tournaments.ts';

const open: RegistrationWindow = {
  status: 'registration',
  startsOn: '2026-10-20',
  registrationDeadline: null,
  maxPlayers: null,
  takenSeats: 0
};

test('sign-up stays open up to and on the play day', () => {
  assert.equal(registrationStateOf(open, '2026-10-15'), 'open');
  assert.equal(registrationStateOf(open, '2026-10-20'), 'open');
});

test('a tournament whose day is over closes, even with no deadline', () => {
  assert.equal(registrationStateOf(open, '2026-10-21'), 'closed');
  assert.equal(registrationStateOf({ ...open, startsOn: null }, '2026-10-21'), 'open');
});

test('the deadline and the cap still close it first', () => {
  assert.equal(
    registrationStateOf({ ...open, registrationDeadline: '2026-10-18' }, '2026-10-19'),
    'deadline_passed'
  );
  assert.equal(
    registrationStateOf({ ...open, maxPlayers: 8, takenSeats: 8 }, '2026-10-15'),
    'full'
  );
});
