import { Badge } from '@databricks/appkit-ui/react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

export function RatingBadge({ rating }: { rating: string | null | undefined }) {
  if (rating === 'POSITIVE')
    return (
      <Badge variant="outline" className="gap-1 border-success/40 bg-success/10 text-success">
        <ThumbsUp className="h-3 w-3" /> Positive
      </Badge>
    );
  if (rating === 'NEGATIVE')
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/10 text-destructive">
        <ThumbsDown className="h-3 w-3" /> Negative
      </Badge>
    );
  return <span className="text-xs text-muted-foreground">—</span>;
}
