import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Note } from '../model/notes.model';
import { NotesService } from '../service/notes.service';

@Component({
  selector: 'notes-widget',
  standalone: true,
  imports: [ CommonModule ],
  templateUrl: './notes.widget.html',
  styleUrl: './notes.widget.css',
})
export class NotesWidget implements OnInit, AfterViewInit {
  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  notes: Note[] = [];
  visibleNotes: Note[] = [];

  readonly MARGIN = 12;

  constructor(private notesService: NotesService) {}

  ngOnInit(): void {
    this.notesService.getWidgetNotes().subscribe(notes => {
      this.notes = notes
      setTimeout(() => this.updateVisibleNotes());
    });
  }

  ngAfterViewInit(): void {
    const observer = new ResizeObserver(() => {
      setTimeout(() => this.updateVisibleNotes());
    });

    observer.observe(this.container.nativeElement);
    setTimeout(() => this.updateVisibleNotes());
  }

  updateVisibleNotes() {
    const height = this.container.nativeElement.clientHeight;

    if (height <= 0) return;

    const firstLi = this.container.nativeElement.querySelector('li');
    const rowHeight = firstLi?.getBoundingClientRect().height ?? 48;

    const maxNotes = Math.floor(
      (height + this.MARGIN) / (rowHeight + this.MARGIN)
    );

    this.visibleNotes = this.notes.slice(0, Math.max(maxNotes, 1));
  }
}
