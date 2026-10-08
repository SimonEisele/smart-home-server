import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AccountManager } from './account-manager';
import { AuthService } from '../auth/service/auth.service';
import { HouseholdService } from '../../shared/services/household.service';
import { Household, HouseholdMember } from '../auth/model/auth.model';

const household: Household = { id: 'a', name: 'Biel', description: '', invite_code: 'invite', role: 'owner', member_count: 2 };
const member: HouseholdMember = { id: 'm', user_id: 'u', user_first_name: 'Simon', user_last_name: 'Eisele', user_email: 's@example.com', user_is_household_account: false, role: 'member', joined_at: '' };
function setup() {
  const active = new BehaviorSubject<Household | null>(household);
  const service = { activeHousehold$: active, households$: of([household]), get activeHousehold() { return active.value; }, getMembers: vi.fn(() => of([member])), updateMemberRole: vi.fn(), switchHousehold: vi.fn(), createHousehold: vi.fn(), updateHousehold: vi.fn() };
  TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user$: of(null) } }, { provide: HouseholdService, useValue: service }] });
  const page = TestBed.createComponent(AccountManager).componentInstance;
  return { page, service, active };
}
it('ignores late member responses after changing households and clears stale editors', () => {
  const { page, service, active } = setup();
  const old = new Subject<HouseholdMember[]>();
  service.getMembers.mockReturnValueOnce(old);
  page.ngOnInit(); page.tab = 'accounts'; page.newAccount.password = 'secret';
  active.next({ ...household, id: 'b', role: 'member' });
  old.next([{ ...member, user_email: 'stale@example.com' }]);
  expect(page.members[0].user_email).toBe('s@example.com');
  expect(page.tab).toBe('members'); expect(page.newAccount.password).toBe('');
  active.next(null); expect(page.members).toEqual([]);
});
it('shows loading failures and recovers on retry', () => {
  const { page, service } = setup();
  service.getMembers.mockReturnValueOnce(throwError(() => new Error('offline')));
  page.loadMembers('a'); expect(page.memberError).toBeTruthy(); expect(page.loadingMembers).toBe(false);
  page.loadMembers('a'); expect(page.memberError).toBe(''); expect(page.members).toEqual([member]);
});
it('blocks duplicate role requests and preserves the role on failure', () => {
  const { page, service } = setup(); page.members = [member];
  const pending = new Subject<unknown>(); service.updateMemberRole.mockReturnValue(pending);
  page.updateMemberRole('u', 'admin'); page.updateMemberRole('u', 'admin');
  expect(service.updateMemberRole).toHaveBeenCalledTimes(1);
  expect(pending.observed).toBe(true);
  pending.error(new Error('offline'));
  expect(page.members[0].role).toBe('member'); expect(page.memberError).toBeTruthy(); expect(page.memberPending.size).toBe(0);
});
it('searches names and emails without hiding shared device accounts from the counts', () => {
  const { page } = setup(); page.members = [member, { ...member, user_id: 'tablet', user_first_name: 'Tablet', user_is_household_account: true }];
  page.memberSearch = ' EISELE '; expect(page.filteredMembers.length).toBe(2);
  page.memberSearch = 'tablet'; expect(page.filteredMembers.length).toBe(1);
  expect(page.personalMemberCount).toBe(1); expect(page.wgAccountMembers.length).toBe(1);
});
it('reports switch failures and permits retry', () => {
  const { page, service } = setup(); service.switchHousehold.mockReturnValue(throwError(() => new Error('offline')));
  page.switchTo('b'); expect(page.switchError).toBeTruthy(); expect(page.switching).toBe(false);
});
