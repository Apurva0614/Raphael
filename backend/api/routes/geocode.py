from fastapi import APIRouter, HTTPException, Query
import httpx

router = APIRouter(prefix="/api/v1/geocode", tags=["geocode"])

PLACE_TIER_MAP = {
    "state_capital": 0,
    "city": 1,
    "administrative": 2,
    "town": 3,
    "suburb": 4,
    "village": 5,
    "hamlet": 6,
}

def place_tier(result: dict) -> int:
    place_type = result.get("type") or result.get("addresstype") or ""
    return PLACE_TIER_MAP.get(place_type, 4)

@router.get("")
async def geocode(q: str = Query(..., min_length=2, max_length=100), limit: int = Query(8, ge=1, le=50)):
    if not q or len(q.strip()) < 2:
        return {"results": []}
    
    params = {
        "q": q.strip(),
        "format": "json",
        "limit": limit,
        "addressdetails": 1,
        "extratags": 1,
        "namedetails": 1,
        "countrycodes": "in",
    }
    headers = {"User-Agent": "Raphael-EnvironmentalIntelligence/1.0"}
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params, headers=headers
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Geocoding service unavailable")
    
    # Two-key sort: place tier first (ascending), importance as tiebreaker (descending)
    sorted_results = sorted(
        data,
        key=lambda r: (place_tier(r), -float(r.get("importance") or 0.0))
    )
    
    return {
        "results": [
            {
                "display_name": r.get("display_name"),
                "lat": float(r.get("lat") or 0.0),
                "lon": float(r.get("lon") or 0.0),
                "type": r.get("type") or r.get("addresstype"),
                "importance": float(r.get("importance") or 0.0),
                "tier": place_tier(r),
            }
            for r in sorted_results
        ]
    }
