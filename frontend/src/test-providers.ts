import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
export default [provideHttpClient(), provideHttpClientTesting(), provideRouter([])];
