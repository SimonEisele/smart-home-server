import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-impressum',
  standalone: true,
  imports: [ CommonModule, TranslateModule],
  templateUrl: './impressum.html',
  styleUrl: './impressum.css',
})
export class Impressum {

}
