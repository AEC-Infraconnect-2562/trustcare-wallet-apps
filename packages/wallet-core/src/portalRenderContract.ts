export type PortalRenderRecord = Record<string, unknown>;

export type PortalRenderContract = {
  hospital: PortalRenderRecord;
  patient: PortalRenderRecord;
  document: PortalRenderRecord;
  issuer: PortalRenderRecord;
  renderData: PortalRenderRecord;
};

export function extractPortalRenderData(subject: PortalRenderRecord): PortalRenderRecord {
  const humanDocument = portalRecord(subject.humanDocument);
  return portalRecord(humanDocument.renderData ?? humanDocument);
}

export function normalizePortalRenderSubject(
  rawSubject: PortalRenderRecord,
  credential: PortalRenderRecord = {},
): PortalRenderRecord {
  const humanDocument = portalRecord(rawSubject.humanDocument);
  const renderData = extractPortalRenderData(rawSubject);
  const renderPatient = portalRecord(renderData.patient);
  const renderDocument = portalRecord(renderData.document);
  const renderHospital = portalRecord(renderData.hospital ?? renderData.issuer);
  const rawPatient = firstPortalRecord(
    rawSubject.patient,
    rawSubject.student,
    rawSubject.staff,
    rawSubject.holder,
  );
  const rawDocument = portalRecord(rawSubject.document);
  const rawHospital = firstPortalRecord(
    rawSubject.organization,
    rawSubject.hospital,
    rawSubject.issuer,
    credential.issuer,
  );
  const hospital = { ...rawHospital, ...renderHospital };
  const patient = { ...rawPatient, ...renderPatient };
  const document = { ...rawDocument, ...renderDocument };

  return {
    ...rawSubject,
    ...renderData,
    patient,
    holder: { ...portalRecord(rawSubject.holder), ...patient },
    hospital,
    organization: hospital,
    issuer: {
      ...portalRecord(credential.issuer),
      ...portalRecord(rawSubject.issuer),
      ...portalRecord(renderData.issuer),
      ...hospital,
    },
    document,
    humanDocument: {
      ...humanDocument,
      renderData: {
        ...renderData,
        hospital,
        patient,
        document,
      },
    },
  };
}

export function mergePortalRenderPayload(
  source: PortalRenderRecord,
  keys: string[],
): PortalRenderRecord {
  const renderData = extractPortalRenderData(source);
  const renderDocument = portalRecord(renderData.document);
  const rawDocument = portalRecord(source.document);
  const base = {
    ...source,
    ...renderData,
    document: { ...rawDocument, ...renderDocument },
  };
  const sources = [source, renderData, renderDocument, rawDocument];

  for (const key of keys) {
    for (const candidate of sources) {
      const nested = portalRecord(candidate[key]);
      if (Object.keys(nested).length > 0) return { ...base, ...nested };
    }
  }
  return base;
}

export function portalRecord(value: unknown): PortalRenderRecord {
  return isPortalRecord(value) ? value : {};
}

export function firstPortalRecord(...values: unknown[]): PortalRenderRecord {
  return (values.find(isPortalRecord) as PortalRenderRecord | undefined) ?? {};
}

function isPortalRecord(value: unknown): value is PortalRenderRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
