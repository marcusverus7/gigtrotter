"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { submitEvent } from "./actions";

const CATEGORIES = [
  { value: "concert", label: "Concert" },
  { value: "festival", label: "Festival" },
  { value: "club_night", label: "Club night" },
  { value: "theatre", label: "Theatre" },
  { value: "comedy", label: "Comedy" },
  { value: "sport", label: "Sport" },
  { value: "other", label: "Other" },
];

export function SubmitEventForm({
  promoterName,
}: {
  promoterName: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("concert");
  const [headliner, setHeadliner] = useState("");
  const [artists, setArtists] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueCountry, setVenueCountry] = useState("UK");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("19:00");
  const [doorsDate, setDoorsDate] = useState("");
  const [doorsTime, setDoorsTime] = useState("18:00");
  const [imageUrl, setImageUrl] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [tags, setTags] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [ticketProvider, setTicketProvider] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await submitEvent({
          title,
          description: description || null,
          category: category as any,
          headliner: headliner || null,
          artistNames: artists
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          venueName: venueName || null,
          venueCity: venueCity || null,
          venueCountry: venueCountry || null,
          startsAt: startDate
            ? new Date(`${startDate}T${startTime || "19:00"}`).toISOString()
            : null,
          doorsAt: doorsDate
            ? new Date(`${doorsDate}T${doorsTime || "18:00"}`).toISOString()
            : null,
          imageUrl: imageUrl || null,
          minPriceCents: minPrice ? Math.round(parseFloat(minPrice) * 100) : null,
          maxPriceCents: maxPrice ? Math.round(parseFloat(maxPrice) * 100) : null,
          tags: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          ticketUrl: ticketUrl || null,
          ticketProvider: ticketProvider || null,
        });
        setSuccess(true);
        toast.success("Event submitted! It's now live on the Events page.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't submit event.");
      }
    });
  }

  if (success) {
    return (
      <div className="space-y-4 rounded-lg border border-secondary/30 bg-secondary/5 p-6 text-center">
        <CalendarPlus className="mx-auto h-12 w-12 text-secondary" />
        <h3 className="text-lg font-semibold">Event submitted</h3>
        <p className="text-sm text-muted-foreground">
          Your event is now live. Users can find it, mark interest, and click
          through to buy tickets.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setSuccess(false);
            setTitle("");
            setDescription("");
            setHeadliner("");
            setArtists("");
            setVenueName("");
            setStartDate("");
            setStartTime("19:00");
            setDoorsDate("");
            setDoorsTime("18:00");
            setImageUrl("");
            setMinPrice("");
            setMaxPrice("");
            setTags("");
            setTicketUrl("");
            setTicketProvider("");
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Submit another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ev-title">Event title *</Label>
          <Input
            id="ev-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Glastonbury Festival 2026"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ev-category">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="ev-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ev-headliner">Headliner</Label>
          <Input
            id="ev-headliner"
            value={headliner}
            onChange={(e) => setHeadliner(e.target.value)}
            placeholder="Arctic Monkeys"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ev-artists">Artists (comma-separated)</Label>
          <Input
            id="ev-artists"
            value={artists}
            onChange={(e) => setArtists(e.target.value)}
            placeholder="Arctic Monkeys, Fontaines D.C., Charli XCX"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ev-desc">Description</Label>
          <Input
            id="ev-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description of the event"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-venue">Venue name</Label>
          <Input
            id="ev-venue"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="Worthy Farm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-city">City</Label>
          <Input
            id="ev-city"
            value={venueCity}
            onChange={(e) => setVenueCity(e.target.value)}
            placeholder="Pilton"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-country">Country</Label>
          <Input
            id="ev-country"
            value={venueCountry}
            onChange={(e) => setVenueCountry(e.target.value)}
            placeholder="UK"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ev-start-date">Event date *</Label>
          <Input
            id="ev-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-start-time">Start time</Label>
          <Input
            id="ev-start-time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-doors-date">Doors date</Label>
          <Input
            id="ev-doors-date"
            type="date"
            value={doorsDate}
            onChange={(e) => setDoorsDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-doors-time">Doors time</Label>
          <Input
            id="ev-doors-time"
            type="time"
            value={doorsTime}
            onChange={(e) => setDoorsTime(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-min">Min price (£)</Label>
          <Input
            id="ev-min"
            type="number"
            step="0.01"
            min="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="25.00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-max">Max price (£)</Label>
          <Input
            id="ev-max"
            type="number"
            step="0.01"
            min="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="65.00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-image">Image URL</Label>
          <Input
            id="ev-image"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ev-ticket-url">Ticket link</Label>
          <Input
            id="ev-ticket-url"
            value={ticketUrl}
            onChange={(e) => setTicketUrl(e.target.value)}
            placeholder="https://ticketmaster.co.uk/..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-ticket-provider">Provider name</Label>
          <Input
            id="ev-ticket-provider"
            value={ticketProvider}
            onChange={(e) => setTicketProvider(e.target.value)}
            placeholder="Ticketmaster"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ev-tags">Tags (comma-separated)</Label>
        <Input
          id="ev-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="indie, rock, outdoor"
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} size="lg">
          <CalendarPlus className="mr-2 h-4 w-4" />
          {pending ? "Submitting…" : "Submit event"}
        </Button>
      </div>
    </form>
  );
}
