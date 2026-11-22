import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { PageError } from "@/components/ui/page-error";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { BackLink, PageHeader } from "@/shell/PageHeader";
import type { Back } from "@/shell/piece-link";

type Parts = { pictures: ReactNode; details: ReactNode; below?: ReactNode };

// The frame of an item's page: Back, then the pictures beside the details on
// a wide screen, one under the other on a phone, then the parts below. It
// owns the order of the gone, failed, loading, and found states, so each
// item's page brings only its parts.
export function ItemPage<D, T>({
	back,
	query,
	find,
	failedTitle,
	children,
}: {
	back: Back;
	query: UseQueryResult<D>;
	find: (data: D) => T | undefined;
	failedTitle: string;
	children: (item: T) => Parts;
}) {
	const item = query.data === undefined ? undefined : find(query.data);
	// A typed address, an item of another account, or one deleted since.
	if (query.data !== undefined && item === undefined)
		return <Navigate to={back.to} state={back.state} replace />;
	// A list that answered once keeps its data through a failed reload, so
	// only a list with no data at all counts as failed.
	if (query.isError && query.data === undefined)
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<PageHeader start={<BackLink to={back.to} state={back.state} />} />
				<PageError title={failedTitle} onRetry={() => void query.refetch()} />
			</div>
		);
	const parts: Parts =
		item === undefined
			? {
					pictures: (
						<span
							data-slot="item-skeleton"
							className={`block aspect-[3/4] w-full rounded-[14px] ${PLACEHOLDER}`}
						/>
					),
					details: null,
				}
			: children(item);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader start={<BackLink to={back.to} state={back.state} />} />
			<div className="flex min-h-0 flex-1 flex-col gap-10 overflow-auto px-4 pt-1 pb-24 wide:px-6">
				<div className="mx-auto flex w-full max-w-[928px] flex-col gap-6 wide:grid wide:grid-cols-[minmax(0,420px)_minmax(0,1fr)] wide:gap-12">
					<div className="min-w-0">{parts.pictures}</div>
					<div className="flex min-w-0 flex-col gap-4">{parts.details}</div>
				</div>
				{parts.below ? (
					<div className="mx-auto flex w-full max-w-[928px] flex-col gap-10">
						{parts.below}
					</div>
				) : null}
			</div>
		</div>
	);
}
