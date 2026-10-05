import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ShoppinglistService } from './shoppinglist.service';

it('uses server attendance and the ISO week boundary for the shopping-page export',()=>{
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
  const service=TestBed.inject(ShoppinglistService),http=TestBed.inject(HttpTestingController);
  service.exportMenuplan(['2018-12-31:dinner'],'2018-W53',{'2018-12-31:dinner':99}).subscribe();
  const req=http.expectOne(r=>r.url.endsWith('/shopping-items/export-week/'));
  expect(req.request.body).toEqual({weekStart:'2018-12-31',meals:['2018-12-31:dinner'],extraServings:{},strict:true,resetExisting:true});
  req.flush({count:1});http.verify();
});
