import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-privacypolicy',
  standalone: true,
  imports: [ CommonModule, TranslateModule ],
  templateUrl: './privacypolicy.html',
  styleUrl: './privacypolicy.css',
})
export class Privacypolicy {

}
