import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'register',
  imports: [ CommonModule ],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  prenameError = true;
  lastNameError = true;
  emailError = true;
  countryCodeError = true;
  phoneNumberError = true;
  passwordError = true;
  passwordRepetitionError = true;
}
