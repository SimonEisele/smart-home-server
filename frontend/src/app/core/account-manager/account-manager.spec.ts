import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountManager } from './account-manager';

describe('AccountManager', () => {
  let component: AccountManager;
  let fixture: ComponentFixture<AccountManager>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountManager]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccountManager);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
