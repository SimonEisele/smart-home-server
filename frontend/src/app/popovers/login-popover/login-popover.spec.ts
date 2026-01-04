import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginPopover } from './login-popover';

describe('LoginPopover', () => {
  let component: LoginPopover;
  let fixture: ComponentFixture<LoginPopover>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPopover]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginPopover);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
