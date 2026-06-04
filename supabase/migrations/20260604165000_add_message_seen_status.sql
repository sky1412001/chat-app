-- Add read receipt support to messages
ALTER TABLE public.messages
  ADD COLUMN is_seen BOOLEAN NOT NULL DEFAULT false;

GRANT UPDATE ON public.messages TO authenticated;

CREATE POLICY "Recipients can mark their received messages seen"
  ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id AND is_seen = true);
