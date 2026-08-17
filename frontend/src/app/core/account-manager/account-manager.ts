import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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
  user$: Observable<User | null>;
  households$: Observable<Household[]>;
  activeHousehold$: Observable<Household | null>;

  members: HouseholdMember[] = [];
  loadingMembers = false;

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
    this.activeHousehold$.subscribe(hh => {
      if (hh) this.loadMembers(hh.id);
    });
  }

  loadMembers(householdId: string) {
    this.loadingMembers = true;
    this.householdService.getMembers(householdId).subscribe({
      next: m => { this.members = m; this.loadingMembers = false; this.cdr.detectChanges(); },
      error: () => { this.loadingMembers = false; this.cdr.detectChanges(); },
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
    this.householdService.switchHousehold(id).subscribe(() => this.cdr.detectChanges());
  }

  createWg() {
    if (!this.newWgName.trim()) return;
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
    if (!this.inviteCode.trim()) return;
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

  copyInviteCode(code: string) {
    navigator.clipboard.writeText(code);
  }

  updateMemberRole(userId: string, role: string) {
    const hh = this.householdService.activeHousehold;
    if (!hh) return;
    this.householdService.updateMemberRole(hh.id, userId, role).subscribe({
      next: updated => {
        this.members = this.members.map(m => m.user_id === userId ? { ...m, role: updated.role } : m);
        this.cdr.detectChanges();
      }
    });
  }

  removeMember(userId: string) {
    const hh = this.householdService.activeHousehold;
    if (!hh) return;
    if (!confirm('Mitglied wirklich entfernen?')) return;
    this.householdService.removeMember(hh.id, userId).subscribe({
      next: () => { this.members = this.members.filter(m => m.user_id !== userId); this.cdr.detectChanges(); }
    });
  }

  startEditName(hh: Household) {
    this.editName = hh.name;
    this.editingName = true;
  }

  saveEditName(hh: Household) {
    if (!this.editName.trim()) return;
    this.householdService.updateHousehold(hh.id, { name: this.editName.trim() }).subscribe({
      next: () => { this.editingName = false; this.cdr.detectChanges(); },
    });
  }

  createHouseholdAccount(hh: Household) {
    if (!this.newAccount.name.trim() || !this.newAccount.password.trim()) return;
    this.creatingAccount = true;
    this.createAccountError = '';
    this.createAccountSuccess = '';
    this.householdService.createHouseholdAccount(hh.id, this.newAccount).subscribe({
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
    if (!confirm('WG-Konto wirklich löschen? Der Login wird dauerhaft entfernt.')) return;
    this.householdService.deleteHouseholdAccount(hh.id, userId).subscribe({
      next: () => { this.members = this.members.filter(m => m.user_id !== userId); this.cdr.detectChanges(); }
    });
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
    if (!this.newPasswordVal.trim()) return;
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

