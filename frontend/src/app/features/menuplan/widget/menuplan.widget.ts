import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Menu } from '../model/menuplan.model';
import { MenuService } from '../service/menuplan.service';

@Component({
  selector: 'menuplan-widget',
  standalone: true,
  imports: [ CommonModule ],
  templateUrl: './menuplan.widget.html',
  styleUrl: './menuplan.widget.css',
})
export class MenuplanWidget implements OnInit, AfterViewInit {
  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;
  menus: Menu[] = [];
  visibleMenus: Menu[] = [];

  readonly GAP = 12;
  readonly MENU_WIDTH = 186;

  constructor(private menuService: MenuService) {}

  ngOnInit() {
    this.menuService.generateMockMenus(new Date());
    this.menuService.getMenus().subscribe((menus) => {
      this.menus = menus;
    });
  }

  ngAfterViewInit(): void {
    const observer = new ResizeObserver(() => {
      setTimeout(() => this.updateVisibleData());
    });

    observer.observe(this.container.nativeElement);
    setTimeout(() => this.updateVisibleData());
  }

  updateVisibleData() {
    if (!this.menus) return;

    const width = this.container.nativeElement.clientWidth;
    if (width <= 0) return;

    const menuCount = Math.max(1, Math.floor((width + this.GAP) / (this.MENU_WIDTH + this.GAP)));

    this.visibleMenus = this.menus.slice(0, menuCount);
  }
}
