import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { FeedbackModal } from '../../popups/feedbackmodal/feedback-modal';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-footer',
  imports: [FeedbackModal, RouterLink, TranslateModule],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  isFeedbackOpen = false;
  currentLanguage = '';

  constructor(private languageService: LanguageService) {
    this.currentLanguage = this.languageService.currentLanguage;
    this.languageService.language$.subscribe(lang => {
      this.currentLanguage = lang;
    });
  }

}
