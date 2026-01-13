/**
 * Docker Image Management Component
 * 
 * Displays and manages Docker images with ability to delete unused images
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  HardDrive,
  Trash2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";

interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;
  sizeFormatted: string;
  created: string;
  createdAt: Date;
  inUse: boolean;
}

export function ImageManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DockerImage | null>(null);
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);

  // Fetch images
  const { data: imagesData, isLoading, refetch } = trpc.images.list.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Delete image mutation
  const deleteImageMutation = trpc.images.delete.useMutation({
    onSuccess: () => {
      toast.success("Image deleted successfully");
      refetch();
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete image: ${error.message}`);
    },
  });

  // Prune images mutation
  const pruneImagesMutation = trpc.images.prune.useMutation({
    onSuccess: (data) => {
      toast.success(`Pruned images. Space reclaimed: ${data.spaceReclaimedFormatted}`);
      refetch();
      setShowPruneConfirm(false);
    },
    onError: (error) => {
      toast.error(`Failed to prune images: ${error.message}`);
    },
  });

  const images = imagesData?.images || [];
  const filteredImages = images.filter(img => 
    img.repository.toLowerCase().includes(searchTerm.toLowerCase()) ||
    img.tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
    img.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const unusedImages = images.filter(img => !img.inUse);
  const totalSize = images.reduce((acc, img) => acc + img.size, 0);
  const unusedSize = unusedImages.reduce((acc, img) => acc + img.size, 0);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value < 10 ? 1 : 0)}${units[i]}`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + " " + date.toLocaleTimeString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/80 backdrop-blur border-primary/30 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded border border-primary/30">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono">TOTAL IMAGES</p>
              <p className="text-xl font-bold">{images.length}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-card/80 backdrop-blur border-primary/30 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded border border-primary/30">
              <HardDrive className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono">TOTAL SIZE</p>
              <p className="text-xl font-bold">{formatBytes(totalSize)}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-card/80 backdrop-blur border-yellow-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/10 rounded border border-yellow-500/30">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono">UNUSED</p>
              <p className="text-xl font-bold text-yellow-400">
                {unusedImages.length} ({formatBytes(unusedSize)})
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Input
          placeholder="Search images..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs bg-card/50 border-primary/30 font-mono text-sm"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="border-primary/50 text-primary hover:bg-primary/10"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            REFRESH
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPruneConfirm(true)}
            disabled={unusedImages.length === 0 || pruneImagesMutation.isPending}
            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            PRUNE UNUSED
          </Button>
        </div>
      </div>

      {/* Images Table */}
      <Card className="bg-card/80 backdrop-blur border-primary/30 overflow-hidden">
        {isLoading && images.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground font-mono">Loading images...</span>
          </div>
        ) : imagesData?.error ? (
          <div className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto text-red-400 mb-2" />
            <p className="text-red-400 font-mono text-sm">{imagesData.error}</p>
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="p-6 text-center">
            <Package className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground font-mono text-sm">
              {searchTerm ? "No images match your search" : "No images found"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-primary/30 hover:bg-transparent">
                <TableHead className="font-mono text-xs text-muted-foreground">REPOSITORY</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">TAG</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">IMAGE ID</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">SIZE</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">CREATED</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">STATUS</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredImages.map((image) => (
                <TableRow key={image.id} className="border-primary/20 hover:bg-primary/5">
                  <TableCell className="font-mono text-sm">{image.repository}</TableCell>
                  <TableCell className="font-mono text-sm text-primary">{image.tag}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{image.id}</TableCell>
                  <TableCell className="font-mono text-sm">{image.sizeFormatted}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDate(image.created)}
                  </TableCell>
                  <TableCell>
                    {image.inUse ? (
                      <Badge variant="outline" className="badge-running text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        IN USE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="badge-warning text-xs">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        UNUSED
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(image)}
                      disabled={image.inUse || deleteImageMutation.isPending}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-primary/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">DELETE IMAGE</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-muted-foreground">
              Are you sure you want to delete image "{deleteTarget?.repository}:{deleteTarget?.tag}"?
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteImageMutation.mutate({ imageId: deleteTarget.id })}
              className="font-mono bg-red-500 hover:bg-red-600"
            >
              {deleteImageMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              DELETE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prune Confirmation Dialog */}
      <AlertDialog open={showPruneConfirm} onOpenChange={setShowPruneConfirm}>
        <AlertDialogContent className="bg-card border-primary/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">PRUNE UNUSED IMAGES</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-muted-foreground">
              This will remove all unused images ({unusedImages.length} images, {formatBytes(unusedSize)}).
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pruneImagesMutation.mutate()}
              className="font-mono bg-red-500 hover:bg-red-600"
            >
              {pruneImagesMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              PRUNE
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
