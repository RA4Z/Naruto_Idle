import type { NativeGrid } from "./navigation";
import { sceneryProfile } from "./map-scenery.ts";

export type SourcePolygon = [number, number][];
export type SceneCutout = { id: string; points: SourcePolygon; groundY: number };

// Authored corrections in source-image pixels (2048 x 2048 for 10006).
// Keep canopy silhouettes separate from solid ground footprints.
export const TRAINING_OBSTACLES: SourcePolygon[] = [
  // Dense island south of the training posts, including its shrubs/trunks.
  [[790, 1445], [820, 1390], [950, 1370], [1060, 1390], [1130, 1345], [1250, 1370], [1395, 1390], [1450, 1470], [1440, 1570], [1370, 1640], [1200, 1685], [1000, 1650], [850, 1570]],
  // Ground occupied by the woods on either side of the clearing.
  [[0, 530], [240, 525], [360, 605], [440, 720], [455, 920], [430, 1070], [245, 1120], [0, 1110]],
  [[0, 1100], [290, 1110], [430, 1140], [505, 1275], [480, 1390], [510, 1530], [320, 1600], [0, 1660]],
  [[1700, 560], [2048, 475], [2048, 1150], [1810, 1140], [1660, 1060], [1610, 880], [1640, 690]],
  // Monument base and the three wooden posts.
  [[1005, 465], [1105, 465], [1130, 535], [1075, 570], [1010, 550], [985, 515]],
  [[890, 1000], [941, 1000], [941, 1042], [890, 1042]],
  [[1035, 1000], [1085, 1000], [1085, 1042], [1035, 1042]],
  [[1163, 1000], [1214, 1000], [1214, 1042], [1163, 1042]],
  // The flattened mesh has no recovered transparency. Keep its painted band
  // solid until a true transparent fence asset exists. Preserve the gate gap.
  [[0, 1080], [522, 1355], [522, 1648], [0, 1418]],
  [[638, 1400], [1920, 2010], [1980, 2048], [1535, 2048], [638, 1676]],
];

export const TRAINING_CUTOUTS: SceneCutout[] = [
  { id: "southern-trees", points: [[770, 1450], [795, 1370], [850, 1310], [940, 1290], [1015, 1330], [1070, 1300], [1120, 1230], [1170, 1200], [1220, 1220], [1250, 1270], [1310, 1280], [1340, 1310], [1400, 1280], [1450, 1350], [1470, 1400], [1445, 1460], [1480, 1510], [1450, 1570], [1370, 1640], [1200, 1685], [1000, 1650], [850, 1570]], groundY: 1688 },
  { id: "west-trees", points: [[0, 460], [100, 435], [210, 480], [275, 540], [330, 535], [355, 610], [400, 650], [430, 750], [430, 850], [450, 970], [420, 1065], [240, 1110], [0, 1090]], groundY: 1120 },
  { id: "gate-shrubs", points: [[0, 1080], [75, 1095], [110, 1130], [210, 1110], [275, 1135], [350, 1110], [420, 1140], [465, 1180], [515, 1250], [490, 1370], [510, 1510], [350, 1590], [0, 1670]], groundY: 1675 },
  { id: "east-trees", points: [[1640, 615], [1670, 550], [1750, 520], [1800, 470], [1890, 490], [1940, 530], [2048, 510], [2048, 1135], [1810, 1135], [1665, 1050], [1630, 900], [1650, 800], [1615, 730]], groundY: 1145 },
  { id: "fence-sign", points: [[672, 1480], [759, 1511], [759, 1601], [672, 1570]], groundY: 1710 },
  { id: "post-west", points: [[891, 895], [899, 880], [921, 876], [939, 884], [940, 1030], [929, 1038], [895, 1035]], groundY: 1042 },
  { id: "post-middle", points: [[1035, 895], [1043, 880], [1063, 876], [1083, 884], [1084, 1030], [1073, 1038], [1039, 1035]], groundY: 1042 },
  { id: "post-east", points: [[1163, 895], [1171, 880], [1191, 876], [1211, 884], [1212, 1030], [1201, 1038], [1167, 1035]], groundY: 1042 },
  { id: "monument", points: [[1054, 38], [1067, 38], [1067, 343], [1095, 400], [1100, 450], [1125, 451], [1120, 523], [1080, 560], [1015, 550], [996, 520], [1002, 463], [1020, 449], [1030, 399], [1054, 343]], groundY: 570 },
];

export function withSceneGeometry(id: string, grid: NativeGrid): NativeGrid {
  const profile = sceneryProfile(id);
  if (id !== "10006" && !profile) return grid;
  const scale = grid.unitsPerSourcePixel;
  const convert = (polygon: SourcePolygon) => polygon.map(([x, y]) => ({ x: x * scale, y: y * scale }));
  if (profile) return { ...grid, obstacles: [...(grid.obstacles || []), ...profile.obstacles.map(convert)] };
  return { ...grid, obstacles: TRAINING_OBSTACLES.map(convert),
    // Original cells steer the player onto the right-hand fence. Restore the
    // visibly open ground between the two gateposts instead.
    walkways: [convert([[548, 1375], [625, 1410], [625, 1690], [548, 1650]])],
  };
}
