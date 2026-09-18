import type { Metadata } from "next";
import { MyRepos } from "@/components/my-repos";

export const metadata: Metadata = { title: "My repos" };

export default function MePage() {
	return <MyRepos />;
}
