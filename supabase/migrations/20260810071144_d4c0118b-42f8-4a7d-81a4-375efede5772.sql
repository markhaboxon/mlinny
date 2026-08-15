create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('telegram-bot-hourly') where exists (select 1 from cron.job where jobname='telegram-bot-hourly');
select cron.schedule(
  'telegram-bot-hourly',
  '2 * * * *',
  $$select net.http_get(
      url := 'https://project--6dc78495-e492-414d-a4f9-63ed4814ba68.lovable.app/api/public/telegram/cron?key=431bcec8d1745d02688e5018b4098a339f8e05bef6f2d832',
      timeout_milliseconds := 30000
  );$$
);