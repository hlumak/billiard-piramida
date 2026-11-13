import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  registrationStateOf,
  tournamentClosureRange,
  tournamentHoldsTables,
  type RegistrationWindow
} from '../src/tournaments.ts';

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

test('a tournament closes its tables from the start hour to the end hour', () => {
  assert.deepEqual(tournamentClosureRange({ startsOn: '2026-11-15', startHour: 15, endHour: 23 }), {
    startDate: '2026-11-15',
    startHour: 15,
    endDate: '2026-11-15',
    endHour: 23
  });
});

test('an end at midnight or later lands on the next date', () => {
  assert.deepEqual(tournamentClosureRange({ startsOn: '2026-11-30', startHour: 18, endHour: 24 }), {
    startDate: '2026-11-30',
    startHour: 18,
    endDate: '2026-12-01',
    endHour: 0
  });
  assert.deepEqual(tournamentClosureRange({ startsOn: '2026-12-31', startHour: 18, endHour: 26 }), {
    startDate: '2026-12-31',
    startHour: 18,
    endDate: '2027-01-01',
    endHour: 2
  });
});

test('no range until the day, start and end are set, and the end comes after the start', () => {
  assert.equal(tournamentClosureRange({ startsOn: null, startHour: 15, endHour: 23 }), null);
  assert.equal(
    tournamentClosureRange({ startsOn: '2026-11-15', startHour: null, endHour: 23 }),
    null
  );
  assert.equal(
    tournamentClosureRange({ startsOn: '2026-11-15', startHour: 15, endHour: null }),
    null
  );
  assert.equal(
    tournamentClosureRange({ startsOn: '2026-11-15', startHour: 15, endHour: 15 }),
    null
  );
  assert.equal(
    tournamentClosureRange({ startsOn: '2026-11-15', startHour: 15, endHour: 27 }),
    null
  );
});

test('drafts and cancelled tournaments hold no tables', () => {
  assert.equal(tournamentHoldsTables('draft'), false);
  assert.equal(tournamentHoldsTables('cancelled'), false);
  assert.equal(tournamentHoldsTables('registration'), true);
  assert.equal(tournamentHoldsTables('closed'), true);
  assert.equal(tournamentHoldsTables('completed'), true);
});
