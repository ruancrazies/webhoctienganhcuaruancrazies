"use client";

import { createContext, useContext } from "react";

/** true khi chùm sáng của công cụ đang chiếu vào ô mật khẩu. Ô mật khẩu đọc nó để bật cùng trạng thái với nút "Hiện". */
export const SceneLitContext = createContext(false);
export const useSceneLit = (): boolean => useContext(SceneLitContext);
