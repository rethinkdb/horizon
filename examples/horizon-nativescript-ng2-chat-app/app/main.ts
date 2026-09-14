// this import should be first in order to load some required settings (like globals and reflect-metadata)
import {nativeScriptBootstrap} from "nativescript-angular/application";
import {HTTP_PROVIDERS} from '@angular/http';
require('nativescript-websockets'); // VERY IMPORTANT this comes BEFORE import of root component below!
import {AppComponent} from "./app.component";

nativeScriptBootstrap(AppComponent, [HTTP_PROVIDERS]);