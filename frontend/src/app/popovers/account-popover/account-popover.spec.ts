import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountPopover } from './account-popover';

describe('AccountPopover', () => {
  let component: AccountPopover;
  let fixture: ComponentFixture<AccountPopover>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountPopover]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccountPopover);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
