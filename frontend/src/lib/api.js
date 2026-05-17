import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Attach bearer fallback (in case cookies are blocked cross-site)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const CHARACTER_IMAGES = {
  immigration_officer:
    "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/64719eee48c1f0f558f7b269dd74d95fe345d52a7f1b980ff13977e12bd8f0fb.png",
  angry_customer:
    "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/0a77ed86bf6f82d6b299d320ab902e46b327998901248bef540966f22608d927.png",
  french_waiter:
    "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/99ec13d506938d89acb6d4b4b01afaa6f1af1884ac12b106cb298628a57d541b.png",
  job_interviewer:
    "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/b0ec318d23c8a53cd44615c4cbb866be2d91d40a5c10265aed0a1ae46592c2ee.png",
  doctor:
    "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/7af2a556fa853f60069d0adfadd45ba1450d40d4a09b92f4d00e69dae499bcd0.png",
  partner:
    "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/4f126367f50b23bc890871893928d91df8ca8f7743a9d7ab27991989eef572b9.png",
  landlord:
    "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/c8f14988a2bc7893bb5d5143fd3293f79340bd7fa06950e15840d698f16c3970.png",
  police_officer:
    "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/3ff09ca4e77f974cf0a635c42bcc7f5523db9765a4c650e1a21c447a88e7b1a7.png",
};

export const HERO_IMAGE =
  "https://static.prod-images.emergentagent.com/jobs/b12d662d-6196-4a76-be6c-30990b739463/images/9b4a785ba9e14b0db789a544047a24fd292d21fe50d80eec1f9eba3bbf9efb2f.png";
