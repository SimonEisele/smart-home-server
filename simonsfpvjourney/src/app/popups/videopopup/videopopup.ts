import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Video } from '../../models/video.model';

@Component({
  selector: 'app-videopopup',
  standalone: true,
  imports: [ CommonModule],
  templateUrl: './videopopup.html',
  styleUrl: './videopopup.css',
})
export class Videopopup {
  @Input() video!: Video;
  @Input() canPrev: boolean = false;
  @Input() canNext: boolean = false;
  @Output() playVideo = new EventEmitter<Video>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();

  onClick() {
    this.playVideo.emit(this.video);
  }

  onPrev() {
    if (this.canPrev) this.prev.emit();
  }
  onNext() {
    if (this.canNext) this.next.emit();
  }
}
