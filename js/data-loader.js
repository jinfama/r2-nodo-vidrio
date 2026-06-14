// ============================================================================
// DATA LOADER - Loads cascorro JSON data files
// ============================================================================

import { NUMERIC_TO_ISO3, shortName } from './utils.js';

const DataLoader = (() => {
    let countryData = {};       // iso3 → array of yearly records
    let countryByYear = {};     // iso3 → Map<year, record>
    let metadata = {};          // iso3 → {iso3, name, region_un_sub, region_minerva}
    let metadataList = [];      // sorted array of metadata objects
    let worldData = [];         // world-level yearly records
    let worldByYear = new Map();
    let regionData = {};        // "level::area" → array of yearly records
    let regionByYear = {};      // "level::area" → Map<year, record>
    let rankings = {};          // indicator → {year → [{iso3, value, rank}, ...]}
    let geoFeatures = [];
    let allYears = [];
    let regionLists = {};       // {region_un_sub: [...], region_minerva: [...]}
    let _ready = false;

    async function init() {
        try {
            // Support embedded data (standalone build) or fetch (HTTP server)
            let topoRaw, countriesRaw, regionsRaw, metaRaw;
            if (typeof CASCORRO_COUNTRIES !== 'undefined') {
                topoRaw = typeof TOPO !== 'undefined' ? TOPO : await fetch('data/countries-110m.json').then(r => r.json());
                countriesRaw = CASCORRO_COUNTRIES;
                regionsRaw = typeof CASCORRO_REGIONS !== 'undefined' ? CASCORRO_REGIONS : [];
                metaRaw = typeof CASCORRO_META !== 'undefined' ? CASCORRO_META : [];
            } else {
                [topoRaw, countriesRaw, regionsRaw, metaRaw] = await Promise.all([
                    fetch('data/countries-110m.json').then(r => r.json()),
                    fetch('data/cascorro_countries.json').then(r => r.json()).catch(() => []),
                    fetch('data/cascorro_regions.json').then(r => r.json()).catch(() => []),
                    fetch('data/cascorro_metadata.json').then(r => r.json()).catch(() => [])
                ]);
            }

            // 1. Build metadata index
            metaRaw.forEach(m => {
                metadata[m.iso3] = {
                    iso3: m.iso3,
                    name: shortName(m.iso3, m.name),
                    fullName: m.name,
                    region_un_sub: m.region_un_sub || '',
                    region_minerva: m.region_minerva || ''
                };
            });
            metadataList = Object.values(metadata).sort((a, b) =>
                a.name.localeCompare(b.name)
            );

            // 2. Build region lists
            const setUnSub = new Set();
            const setMinerva = new Set();
            metadataList.forEach(m => {
                if (m.region_un_sub) setUnSub.add(m.region_un_sub);
                if (m.region_minerva) setMinerva.add(m.region_minerva);
            });
            regionLists = {
                region_un_sub: [...setUnSub].sort(),
                region_minerva: [...setMinerva].sort()
            };

            // Normalize fields: ahdi → hdi_ng (internal web viewer key), pop raw → pop in millions
            function normalizeRecord(d) {
                if (d.ahdi !== undefined) { d.hdi_ng = d.ahdi; delete d.ahdi; }
                else if (d.ahdi_ng !== undefined) { d.hdi_ng = d.ahdi_ng; delete d.ahdi_ng; }
                if (d.pop != null) d.pop = d.pop / 1e6;
                return d;
            }

            // 3. Index country data by ISO3 + year
            const yearSet = new Set();
            countriesRaw.forEach(c => {
                const iso3 = c.iso3;
                const records = (c.data || []).map(normalizeRecord);
                countryData[iso3] = records;
                countryByYear[iso3] = new Map();
                records.forEach(d => {
                    yearSet.add(d.y);
                    countryByYear[iso3].set(d.y, d);
                });
            });
            allYears = [...yearSet].sort((a, b) => a - b);

            // 4. Index region data
            regionsRaw.forEach(r => {
                const key = `${r.level}::${r.area}`;
                const records = (r.data || []).map(normalizeRecord);
                regionData[key] = records;
                regionByYear[key] = new Map();
                records.forEach(d => regionByYear[key].set(d.y, d));
            });

            // 5. World data = regions where level === 'world'
            const worldEntry = regionsRaw.find(r => r.level === 'world');
            worldData = worldEntry ? (regionData[`world::${worldEntry.area}`] || []) : [];
            worldByYear = new Map();
            worldData.forEach(d => worldByYear.set(d.y, d));

            // 6. GeoFeatures from TopoJSON
            const countries = topojson.feature(topoRaw, topoRaw.objects.countries);
            geoFeatures = countries.features
                .filter(f => {
                    const numId = parseInt(f.id || f.properties?.id);
                    return NUMERIC_TO_ISO3[numId] !== 'ATA';
                })
                .map(f => {
                    const numId = parseInt(f.id || f.properties?.id);
                    const iso3 = NUMERIC_TO_ISO3[numId];
                    f.properties = f.properties || {};
                    f.properties.iso3 = iso3;
                    if (iso3 && metadata[iso3]) {
                        f.properties.name = metadata[iso3].name;
                    }
                    return f;
                });

            // 7. Pre-compute rankings for key indicators
            const rankIndicators = ['gdp_pc', 'ghg', 'ghg_pc', 'co2ff', 'hdi', 'hdi_ng', 'pop',
                                     'mfa_ext_tot', 'mfa_con_tot', 'mfa_ext_pc', 'mfa_con_pc',
                                     'crop_total', 'rli', 'pop_density'];
            const countryIsos = Object.keys(countryData);
            rankIndicators.forEach(ind => {
                rankings[ind] = {};
                allYears.forEach(year => {
                    const entries = [];
                    countryIsos.forEach(iso3 => {
                        const d = countryByYear[iso3]?.get(year);
                        if (d && d[ind] != null) {
                            entries.push({ iso3, value: d[ind] });
                        }
                    });
                    entries.sort((a, b) => b.value - a.value);
                    entries.forEach((e, i) => e.rank = i + 1);
                    rankings[ind][year] = entries;
                });
            });

            _ready = true;
            console.log(`Data loaded: ${countryIsos.length} countries, ${allYears.length} years (${allYears[0]}\u2013${allYears[allYears.length - 1]}), ${geoFeatures.length} geo features`);

        } catch (err) {
            console.error('Failed to load data:', err);
            throw err;
        }
    }

    return {
        init,
        isReady() { return _ready; },

        // Country data
        getCountryData(iso3) { return countryData[iso3] || null; },
        getCountryValue(iso3, year) {
            return countryByYear[iso3]?.get(year) || null;
        },

        // World data
        getWorldValue(year) { return worldByYear.get(year) || null; },
        getWorldData() { return worldData; },

        // Region data
        getRegionData(level, area) {
            return regionData[`${level}::${area}`] || null;
        },
        getRegionValue(level, area, year) {
            return regionByYear[`${level}::${area}`]?.get(year) || null;
        },

        // Rankings
        getRanking(indicator, year) { return rankings[indicator]?.[year] || []; },
        getCountryRank(iso3, year, indicator = 'gdp_pc') {
            const r = rankings[indicator]?.[year];
            if (!r) return null;
            const entry = r.find(e => e.iso3 === iso3);
            return entry ? entry.rank : null;
        },
        getTotalCountries(year, indicator = 'gdp_pc') {
            return rankings[indicator]?.[year]?.length || Object.keys(metadata).length;
        },

        // Metadata
        getMetadata(iso3) { return metadata[iso3] || null; },
        getAllMetadata() { return metadataList; },
        getRegionLists() { return regionLists; },
        getRegionCountries(regionType, regionName) {
            return metadataList
                .filter(m => m[regionType] === regionName)
                .map(m => m.iso3);
        },

        // Geography
        getGeoFeatures() { return geoFeatures; },
        getAllYears() { return allYears; },
        getYearRange() {
            return allYears.length > 0 ? [allYears[0], allYears[allYears.length - 1]] : null;
        },
        // Get first year with valid data for a field (minimum across world AND countries)
        getFirstYearForField(field) {
            let earliest = Infinity;
            // Check world data
            for (const d of worldData) {
                if (d[field] != null) { earliest = d.y; break; }
            }
            // Also scan countries for even earlier data
            for (const iso3 of Object.keys(countryData)) {
                const arr = countryData[iso3];
                for (const d of arr) {
                    if (d[field] != null) {
                        if (d.y < earliest) earliest = d.y;
                        break; // only need first year per country
                    }
                }
                if (earliest <= allYears[0]) break; // can't go earlier
            }
            return earliest < Infinity ? earliest : (allYears.length > 0 ? allYears[0] : 1850);
        },
        // Get last year with valid data for a field
        getLastYearForField(field) {
            for (let i = worldData.length - 1; i >= 0; i--) {
                if (worldData[i][field] != null) return worldData[i].y;
            }
            // Fallback: scan countries
            let latest = -Infinity;
            for (const iso3 of Object.keys(countryData)) {
                const arr = countryData[iso3];
                for (let i = arr.length - 1; i >= 0; i--) {
                    if (arr[i][field] != null && arr[i].y > latest) { latest = arr[i].y; break; }
                }
            }
            return latest > -Infinity ? latest : (allYears.length > 0 ? allYears[allYears.length - 1] : 2024);
        },
        getYearExtentForField(field, iso3s = []) {
            let first = Infinity;
            let last = -Infinity;

            const scanRecord = (d) => {
                if (d && d[field] != null) {
                    if (d.y < first) first = d.y;
                    if (d.y > last) last = d.y;
                }
            };

            if (Array.isArray(iso3s) && iso3s.length > 0) {
                iso3s.forEach(iso3 => {
                    const arr = countryData[iso3] || [];
                    arr.forEach(scanRecord);
                });
            } else {
                worldData.forEach(scanRecord);
                Object.keys(countryData).forEach(iso3 => {
                    (countryData[iso3] || []).forEach(scanRecord);
                });
            }

            return first < Infinity && last > -Infinity ? [first, last] : null;
        },

        // Search
        searchCountries(query) {
            if (!query || query.length < 1) return [];
            const q = query.toLowerCase();
            return metadataList.filter(m =>
                m.name.toLowerCase().includes(q) ||
                m.iso3.toLowerCase().includes(q) ||
                (m.fullName && m.fullName.toLowerCase().includes(q))
            ).slice(0, 10);
        }
    };
})();

export default DataLoader;
