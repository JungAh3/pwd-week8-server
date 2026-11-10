import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const source = path.join(__dirname, "..", "src", "data", "restaurants.json");
const destination = path.join(__dirname, "..", "dist", "src", "data");

// tsc는 파일 경로로 읽는 JSON을 복사하지 않으므로 빌드 결과에 함께 넣습니다.
mkdirSync(destination, { recursive: true });
copyFileSync(source, path.join(destination, "restaurants.json"));
