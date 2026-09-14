import {PipeTransform,Pipe} from '@angular/core';
import * as moment from 'moment';

@Pipe({
    name:'fromNow'
})

export class FromNowPipe implements PipeTransform{
    transform(value:Date){
        if(value){
            return moment(value).fromNow();
        }
    }
}