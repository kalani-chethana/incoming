import axios from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      "An unexpected network error occurred";
    return Promise.reject(new Error(message));
  },
);

export default api;

