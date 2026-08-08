import { describe, expect, it } from "vitest";

import {
  jobMatchesLocationPreferences,
  linkedInGeoIdForLocations,
} from "./location-match";

describe("jobMatchesLocationPreferences", () => {
  it("keeps Sri Lanka / Colombo jobs when Sri Lanka is preferred", () => {
    expect(
      jobMatchesLocationPreferences(
        {
          location: "Colombo, Western Province, Sri Lanka",
          city: "Colombo",
          region: null,
          country: "Sri Lanka",
          work_mode: null,
        },
        ["Sri Lanka", "Remote"],
      ),
    ).toBe(true);
  });

  it("rejects US cities when Sri Lanka is preferred even if Remote is also set", () => {
    expect(
      jobMatchesLocationPreferences(
        {
          location: "New York, NY",
          city: "New York",
          region: null,
          country: "United States",
          work_mode: "remote",
        },
        ["Sri Lanka", "Remote"],
      ),
    ).toBe(false);
  });

  it("allows plain remote jobs when Remote is preferred and no foreign country is named", () => {
    expect(
      jobMatchesLocationPreferences(
        {
          location: "Remote",
          city: null,
          region: null,
          country: null,
          work_mode: "remote",
        },
        ["Sri Lanka", "Remote"],
      ),
    ).toBe(true);
  });

  it("rejects India when only Sri Lanka is preferred", () => {
    expect(
      jobMatchesLocationPreferences(
        {
          location: "Bengaluru, India",
          city: "Bengaluru",
          region: null,
          country: "India",
          work_mode: null,
        },
        ["Sri Lanka"],
      ),
    ).toBe(false);
  });

  it("resolves LinkedIn geoId for Sri Lanka preferences", () => {
    expect(linkedInGeoIdForLocations(["Colombo", "Remote"])).toBe("100446352");
    expect(linkedInGeoIdForLocations(["Remote"])).toBeNull();
  });
});
