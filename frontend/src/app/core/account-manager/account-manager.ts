import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/service/auth.service';
import { HouseholdService } from '../../shared/services/household.service';
import { Household, HouseholdMember, User } from '../auth/model/auth.model';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-account-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './account-manager.html',
  styleUrl: './account-manager.css',
})
export class AccountManager implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  user$: Observable<User | null>;
  households$: Observable<Household[]>;
  activeHousehold$: Observable<Household | null>;

  members: HouseholdMember[] = [];
  loadingMembers = false;
  memberError = '';
  memberSearch = '';
  memberPending = new Set<string>();
  switching = false;
  switchError = '';
  inviteFeedback = '';
  savingHousehold = false;
  householdError = '';
  editDescription = '';
  private memberRequest = 0;

  get filteredMembers(): HouseholdMember[] {
    const query = this.memberSearch.trim().toLocaleLowerCase();
    return this.members.filter(m => `${m.user_first_name} ${m.user_last_name} ${m.user_email}`.toLocaleLowerCase().includes(query));
  }

  get personalMemberCount(): number {
    return this.members.filter(m => !m.user_is_household_account).length;
  }

  // Tab state
  tab: 'members' | 'accounts' = 'members';

  // Create WG
  showCreateForm = false;
  newWgName = '';
  newWgDesc = '';
  creating = false;
  createError = '';

  // Join WG
  showJoinForm = false;
  inviteCode = '';
  joining = false;
  joinError = '';

  // Edit WG name
  editingName = false;
  editName = '';

  // WG Account
  showCreateAccountForm = false;
  newAccount = { name: '', password: '' };
  creatingAccount = false;
  createAccountError = '';
  createAccountSuccess = '';
  showPassword = false;

  // WG Account – password change
  editingPasswordFor: string | null = null;
  newPasswordVal = '';
  changePasswordLoading = false;
  changePasswordError = '';
  changePasswordSuccess = '';
  showNewPassword = false;

  // Profile editing
  editingProfile = false;
  profileEdit = { first_name: '', last_name: '', phone_number: '' };
  profileSaving = false;
  profileError = '';
  profileSuccess = '';

  // Own password change
  showPasswordSection = false;
  passwordEdit = { current: '', new_pw: '', confirm: '' };
  showCurrentPw = false;
  showNewPw = false;
  showConfirmPw = false;
  passwordSaving = false;
  passwordError = '';
  passwordSuccess = '';

  constructor(
    public auth: AuthService,
    public householdService: HouseholdService,
    private cdr: ChangeDetectorRef,
  ) {
    this.user$ = this.auth.user$;
    this.households$ = this.householdService.households$;
    this.activeHousehold$ = this.householdService.activeHousehold$;
  }

  ngOnInit() {
    this.activeHousehold$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(hh => {
      this.memberRequest++;
      this.members = [];
      this.memberSearch = '';
      this.memberError = '';
      this.editingName = false;
      this.householdError = '';
      this.inviteFeedback = '';
      this.tab = 'members';
      this.showCreateAccountForm = false;
      this.newAccount = { name: '', password: '' };
      this.cancelChangePassword();
      this.loadingMembers = false;
      if (hh) this.loadMembers(hh.id);
    });
  }

  loadMembers(householdId: string) {
    if (householdId !== this.householdService.activeHousehold?.id) return;
    const request = ++this.memberRequest;
    this.loadingMembers = true;
    this.memberError = '';
    this.householdService.getMembers(householdId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: m => {
        if (request !== this.memberRequest) return;
        this.members = m; this.loadingMembers = false; this.cdr.markForCheck();
      },
      error: () => {
        if (request !== this.memberRequest) return;
        this.members = []; this.memberError = 'Mitglieder konnten nicht geladen werden. Bitte erneut versuchen.';
        this.loadingMembers = false; this.cdr.markForCheck();
      },
    });
  }

  get wgAccountMembers(): HouseholdMember[] {
    return this.members.filter(m => m.user_is_household_account);
  }

  getMemberInitials(m: HouseholdMember): string {
    const fn = (m.user_first_name?.[0] ?? '').toUpperCase();
    const ln = (m.user_last_name?.[0] ?? '').toUpperCase();
    return (fn + ln) || m.user_email[0].toUpperCase();
  }

  getUserInitials(user: User): string {
    const fn = (user.first_name?.[0] ?? '').toUpperCase();
    const ln = (user.last_name?.[0] ?? '').toUpperCase();
    return (fn + ln) || user.email[0].toUpperCase();
  }

  getRoleLabel(role: string): string {
    const map: Record<string, string> = { owner: 'Eigentümer', admin: 'Admin', member: 'Mitglied' };
    return map[role] ?? role;
  }

  switchTo(id: string) {
    if (this.switching || id === this.householdService.activeHousehold?.id) return;
    this.switching = true;
    this.switchError = '';
    this.householdService.switchHousehold(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.switching = false; this.cdr.markForCheck(); },
      error: () => { this.switching = false; this.switchError = 'WG konnte nicht gewechselt werden. Bitte erneut versuchen.'; this.cdr.markForCheck(); },
    });
  }

  createWg() {
    if (this.creating || !this.newWgName.trim()) return;
    this.creating = true;
    this.createError = '';
    this.householdService.createHousehold(this.newWgName.trim(), this.newWgDesc.trim()).subscribe({
      next: () => {
        this.showCreateForm = false;
        this.newWgName = ''; this.newWgDesc = '';
        this.creating = false;
        this.cdr.detectChanges();
      },
      error: () => { this.createError = 'Fehler beim Erstellen'; this.creating = false; this.cdr.detectChanges(); },
    });
  }

  joinWg() {
    if (this.joining || !this.inviteCode.trim()) return;
    this.joining = true;
    this.joinError = '';
    this.householdService.joinHousehold(this.inviteCode.trim()).subscribe({
      next: () => {
        this.showJoinForm = false;
        this.inviteCode = '';
        this.joining = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.joinError = err?.error?.error || 'Ungültiger Code';
        this.joining = false;
        this.cdr.detectChanges();
      },
    });
  }

  async copyInviteCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      this.inviteFeedback = 'Einladungscode kopiert.';
    } catch {
      this.inviteFeedback = 'Kopieren nicht möglich. Bitte den Code markieren und manuell kopieren.';
    }
    if (!this.destroyRef.destroyed) this.cdr.markForCheck();
  }

  private memberAction(userId: string, action: Observable<unknown>, success: () => void) {
    const householdId = this.householdService.activeHousehold?.id;
    if (this.memberPending.has(userId)) return;
    this.memberPending.add(userId);
    this.memberError = '';
    action.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.memberPending.delete(userId);
        if (this.householdService.activeHousehold?.id === householdId) success();
        this.cdr.markForCheck();
      },
      error: err => {
        this.memberPending.delete(userId);
        if (this.householdService.activeHousehold?.id === householdId) {
          this.memberError = err?.error?.error || err?.error?.detail || 'Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.';
          this.members = [...this.members];
        }
        this.cdr.markForCheck();
      },
    });
  }

  trackMember(_index: number, member: HouseholdMember) { return member.user_id; }

  updateMemberRole(userId: string, role: string) {
    if (this.memberPending.has(userId)) return;
    const hh = this.householdService.activeHousehold;
    if (!hh) return;
    const member = this.members.find(m => m.user_id === userId);
    if (!member || member.role === 'owner' || member.user_is_household_account || !['owner', 'admin'].includes(hh.role)) return;
    this.memberAction(userId, this.householdService.updateMemberRole(hh.id, userId, role), () => this.loadMembers(hh.id));
  }

  removeMember(userId: string) {
    const hh = this.householdService.activeHousehold;
    const member = this.members.find(m => m.user_id === userId);
    if (!hh || !member || member.role === 'owner' || this.memberPending.has(userId)) return;
    if (!confirm(`${member.user_first_name || member.user_email} wirklich aus der WG entfernen?`)) return;
    this.memberAction(userId, this.householdService.removeMember(hh.id, userId), () => this.loadMembers(hh.id));
  }

  startEditName(hh: Household) {
    this.editName = hh.name;
    this.editDescription = hh.description;
    this.householdError = '';
    this.editingName = true;
  }

  saveEditName(hh: Household) {
    if (this.savingHousehold || !this.editName.trim()) return;
    this.savingHousehold = true;
    this.householdError = "";
    this.householdService.updateHousehold(hh.id, { name: this.editName.trim(), description: this.editDescription.trim() }).subscribe({
      next: () => { this.savingHousehold = false; this.editingName = false; this.cdr.markForCheck(); },
      error: () => { this.savingHousehold = false; this.householdError = 'WG konnte nicht gespeichert werden.'; this.cdr.markForCheck(); },
    });
  }

  createHouseholdAccount(hh: Household) {
    if (this.creatingAccount || !this.newAccount.name.trim()) return;
    if (this.newAccount.password.trim().length < 6) { this.createAccountError = 'Passwort muss mindestens 6 Zeichen lang sein.'; return; }
    this.creatingAccount = true;
    this.createAccountError = '';
    this.createAccountSuccess = '';
    this.householdService.createHouseholdAccount(hh.id, { name: this.newAccount.name.trim(), password: this.newAccount.password.trim() }).subscribe({
      next: (acct) => {
        this.createAccountSuccess = `WG-Konto "${acct.email}" wurde erstellt.`;
        this.newAccount = { name: '', password: '' };
        this.creatingAccount = false;
        this.loadMembers(hh.id);
      },
      error: (err) => {
        this.createAccountError = err?.error?.error || 'Fehler beim Erstellen';
        this.creatingAccount = false;
        this.cdr.detectChanges();
      }
    });
  }

  deleteHouseholdAccount(userId: string, hh: Household) {
    if (this.memberPending.has(userId)) return;
    if (!confirm('WG-Konto wirklich löschen? Der Login wird dauerhaft entfernt.')) return;
    this.memberAction(userId, this.householdService.deleteHouseholdAccount(hh.id, userId), () => this.loadMembers(hh.id));
  }

  startChangePassword(userId: string) {
    this.editingPasswordFor = userId;
    this.newPasswordVal = '';
    this.changePasswordError = '';
    this.changePasswordSuccess = '';
    this.showNewPassword = false;
  }

  cancelChangePassword() {
    this.editingPasswordFor = null;
    this.newPasswordVal = '';
    this.changePasswordError = '';
    this.changePasswordSuccess = '';
  }

  confirmChangePassword(userId: string, hh: Household) {
    if (this.changePasswordLoading) return;
    if (this.newPasswordVal.trim().length < 6) { this.changePasswordError = 'Passwort muss mindestens 6 Zeichen lang sein.'; return; }
    this.changePasswordLoading = true;
    this.changePasswordError = '';
    this.changePasswordSuccess = '';
    this.householdService.changeHouseholdAccountPassword(hh.id, userId, this.newPasswordVal.trim()).subscribe({
      next: () => {
        this.changePasswordSuccess = 'Passwort wurde geändert.';
        this.changePasswordLoading = false;
        this.newPasswordVal = '';
        this.cdr.detectChanges();
        setTimeout(() => { this.editingPasswordFor = null; this.changePasswordSuccess = ''; this.cdr.detectChanges(); }, 2000);
      },
      error: (err) => {
        this.changePasswordError = err?.error?.error || 'Fehler beim Ändern des Passworts';
        this.changePasswordLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  leavingHousehold = false;
  leaveError = '';

  leaveHousehold(hh: Household) {
    if (this.leavingHousehold) return;
    if (!confirm(`WG "${hh.name}" wirklich verlassen?`)) return;
    this.leavingHousehold = true;
    this.leaveError = '';
    this.householdService.leaveHousehold(hh.id).subscribe({
      next: (updatedUser) => {
        this.auth['userSubject'].next(updatedUser);
        this.leavingHousehold = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.leaveError = err?.error?.error || 'Fehler beim Verlassen der WG';
        this.leavingHousehold = false;
        this.cdr.detectChanges();
      }
    });
  }

  startEditProfile(user: User) {
    this.profileEdit = {
      first_name: user.first_name,
      last_name: user.last_name,
      phone_number: user.phone_number ?? '',
    };
    this.profileError = '';
    this.profileSuccess = '';
    this.editingProfile = true;
  }

  cancelEditProfile() {
    this.editingProfile = false;
    this.profileError = '';
    this.profileSuccess = '';
  }

  saveProfile() {
    if (this.profileSaving) return;
    if (!this.profileEdit.first_name.trim()) { this.profileError = 'Vorname ist erforderlich'; return; }
    this.profileSaving = true;
    this.profileError = '';
    this.profileSuccess = '';
    this.auth.updateProfile(this.profileEdit).subscribe({
      next: () => {
        this.profileSuccess = 'Profil gespeichert.';
        this.profileSaving = false;
        this.editingProfile = false;
        this.cdr.detectChanges();
        setTimeout(() => { this.profileSuccess = ''; this.cdr.detectChanges(); }, 3000);
      },
      error: (err) => {
        this.profileError = err?.error?.error || 'Fehler beim Speichern';
        this.profileSaving = false;
        this.cdr.detectChanges();
      }
    });
  }

  togglePasswordSection() {
    this.showPasswordSection = !this.showPasswordSection;
    if (!this.showPasswordSection) {
      this.passwordEdit = { current: '', new_pw: '', confirm: '' };
      this.passwordError = '';
      this.passwordSuccess = '';
    }
  }

  savePassword() {
    if (this.passwordSaving) return;
    if (!this.passwordEdit.current) { this.passwordError = 'Bitte aktuelles Passwort eingeben'; return; }
    if (!this.passwordEdit.new_pw) { this.passwordError = 'Bitte neues Passwort eingeben'; return; }
    if (this.passwordEdit.new_pw.length < 8) { this.passwordError = 'Passwort muss mindestens 8 Zeichen lang sein'; return; }
    if (this.passwordEdit.new_pw !== this.passwordEdit.confirm) { this.passwordError = 'Passwörter stimmen nicht überein'; return; }
    this.passwordSaving = true;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.auth.updateProfile({ current_password: this.passwordEdit.current, new_password: this.passwordEdit.new_pw }).subscribe({
      next: () => {
        this.passwordSuccess = 'Passwort wurde geändert.';
        this.passwordSaving = false;
        this.passwordEdit = { current: '', new_pw: '', confirm: '' };
        this.showPasswordSection = false;
        this.cdr.detectChanges();
        setTimeout(() => { this.passwordSuccess = ''; this.cdr.detectChanges(); }, 3000);
      },
      error: (err) => {
        this.passwordError = err?.error?.error || 'Fehler beim Ändern des Passworts';
        this.passwordSaving = false;
        this.cdr.detectChanges();
      }
    });
  }
}

