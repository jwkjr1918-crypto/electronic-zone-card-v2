/* eslint-disable @typescript-eslint/no-require-imports */

const XLSX = require("xlsx");

const admin = require("firebase-admin");

const serviceAccount = require(
  "./electronic-zone-card-firebase-adminsdk-fbsvc-86ba62bdf9.json"
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const workbook = XLSX.readFile(
  "./scripts/구역완료현황.xlsx"
);

function getRegion(zoneId) {

  if (zoneId >= 1 && zoneId <= 87) {
    return "후포면";
  }

  if (zoneId >= 88 && zoneId <= 125) {
    return "평해면";
  }

  if (zoneId >= 126 && zoneId <= 167) {
    return "온정면";
  }

  if (zoneId >= 168 && zoneId <= 210) {
    return "기성면";
  }

  if (zoneId >= 211 && zoneId <= 311) {
    return "영해면";
  }

  if (zoneId >= 312 && zoneId <= 367) {
    return "병곡면";
  }

  if (zoneId >= 368 && zoneId <= 429) {
    return "창수면";
  }

  if (zoneId >= 430 && zoneId <= 484) {
    return "축산면";
  }

  return "";
}

async function uploadZones() {

  for (const sheetName of workbook.SheetNames) {

    console.log(`시트 처리중: ${sheetName}`);

    const worksheet =
      workbook.Sheets[sheetName];

    const data =
      XLSX.utils.sheet_to_json(
        worksheet,
        {
          range: 1,
        }
      );

    for (const item of data) {

      const zones = [
        {
          id: item["번호"],
          name: item["구역명"],
        },
        {
          id: item["번호_1"],
          name: item["구역명_1"],
        },
      ];

      for (const zone of zones) {

        if (!zone.id || !zone.name) {
          continue;
        }

        await db
          .collection("zones")
          .doc(String(zone.id))
          .set({
            id: zone.id,
            name: zone.name,
            region: getRegion(zone.id),
            imageUrl: "",
            hasImage: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

        console.log(
          `업로드 완료: ${zone.id} - ${zone.name}`
        );
      }
    }
  }

  console.log("전체 업로드 완료");
}

uploadZones();