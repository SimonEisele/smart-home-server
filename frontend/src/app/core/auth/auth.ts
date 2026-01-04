import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [ CommonModule],
  templateUrl: './auth.html',
  styleUrl: './auth.css',
})
export class Auth {

}
