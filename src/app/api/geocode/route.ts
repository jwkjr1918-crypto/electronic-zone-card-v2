import { NextResponse } from "next/server";

console.log("ENV TEST:", process.env.KAKAO_REST_API_KEY);


type KakaoDocument = {
  x: string;
  y: string;
  address_name?: string;
  place_name?: string;
};

type KakaoResponse = {
  documents?: KakaoDocument[];
  errorType?: string;
  message?: string;
};

async function searchKakao(url: URL, restApiKey: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `KakaoAK ${restApiKey}`,
    },
  });

  const data = (await response.json()) as KakaoResponse;

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    address?: string;
    road?: string;
    number?: string;
    baseAddress?: string;
  };

  const restApiKey = process.env.KAKAO_REST_API_KEY;

  if (!restApiKey) {
    return NextResponse.json(
      {
        error: "KAKAO_REST_API_KEY가 없습니다.",
      },
      { status: 500 }
    );
  }

  const queries = [
    body.address,
    body.baseAddress && body.road && body.number
      ? `${body.baseAddress} ${body.road} ${body.number}`
      : "",
    body.baseAddress && body.number ? `${body.baseAddress} ${body.number}` : "",
    body.baseAddress && body.road ? `${body.baseAddress} ${body.road}` : "",
  ]
    .filter(Boolean)
    .map((query) => String(query).trim());

  const uniqueQueries = [...new Set(queries)];

  if (!uniqueQueries.length) {
    return NextResponse.json({ error: "검색할 주소가 없습니다." }, { status: 400 });
  }

  const tried: unknown[] = [];

  for (const query of uniqueQueries) {
    const addressUrl = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    addressUrl.searchParams.set("query", query);

    const addressResult = await searchKakao(addressUrl, restApiKey);

    tried.push({
      type: "address",
      query,
      status: addressResult.status,
      message: addressResult.data.message,
      count: addressResult.data.documents?.length ?? 0,
    });

    const addressFirst = addressResult.data.documents?.[0];

    if (addressResult.ok && addressFirst) {
      return NextResponse.json({
        lat: Number(addressFirst.y),
        lng: Number(addressFirst.x),
        addressName: addressFirst.address_name ?? query,
        source: "address",
        query,
        tried,
      });
    }

    const keywordUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    keywordUrl.searchParams.set("query", query);

    const keywordResult = await searchKakao(keywordUrl, restApiKey);

    tried.push({
      type: "keyword",
      query,
      status: keywordResult.status,
      message: keywordResult.data.message,
      count: keywordResult.data.documents?.length ?? 0,
    });

    const keywordFirst = keywordResult.data.documents?.[0];

    if (keywordResult.ok && keywordFirst) {
      return NextResponse.json({
        lat: Number(keywordFirst.y),
        lng: Number(keywordFirst.x),
        addressName: keywordFirst.address_name ?? keywordFirst.place_name ?? query,
        source: "keyword",
        query,
        tried,
      });
    }
  }

  return NextResponse.json(
    {
      error: "좌표를 찾지 못했습니다.",
      tried,
    },
    { status: 404 }
  );
}