// Every scene of Robot Workshop, by key. Later tasks replace their own file; this list stays.
import { BootScene } from './BootScene.js?v=0';
import { WorkshopScene } from './WorkshopScene.js?v=0';
import { A1Roll } from './courses/A1Roll.js?v=0';
import { A2Stack } from './courses/A2Stack.js?v=0';
import { A3Bag } from './courses/A3Bag.js?v=0';
import { A4Everyday } from './courses/A4Everyday.js?v=0';
import { B1Lines } from './courses/B1Lines.js?v=0';
import { B2Muncher } from './courses/B2Muncher.js?v=0';
import { B3Pegboard } from './courses/B3Pegboard.js?v=0';
import { B4Silhouette } from './courses/B4Silhouette.js?v=0';
import { BossScene } from './BossScene.js?v=0';
import { RushScene } from './RushScene.js?v=0';
import { GarageScene } from './GarageScene.js?v=0';
import { FreeBuildScene } from './FreeBuildScene.js?v=0';
import { GalleryScene } from './GalleryScene.js?v=0';
import { SandboxScene } from './SandboxScene.js?v=0';

export const SCENES = {
  Boot: BootScene, Workshop: WorkshopScene,
  A1: A1Roll, A2: A2Stack, A3: A3Bag, A4: A4Everyday,
  B1: B1Lines, B2: B2Muncher, B3: B3Pegboard, B4: B4Silhouette,
  Boss: BossScene, Rush: RushScene, Garage: GarageScene, FreeBuild: FreeBuildScene, Gallery: GalleryScene, Sandbox: SandboxScene,
};
