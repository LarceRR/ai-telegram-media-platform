import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller';
import { ImageSelectionService } from './image-selection.service';

@Module({ controllers: [ImagesController], providers: [ImageSelectionService], exports: [ImageSelectionService] })
export class ImagesModule {}
