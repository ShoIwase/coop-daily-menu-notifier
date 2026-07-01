export interface CourseMenu {
  today: string;
  weekly?: string;
}

export interface ScrapedMenus {
  okazu: CourseMenu;
  sikkari: CourseMenu;
}
